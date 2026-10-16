import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DiagramViewer } from './diagram-viewer';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g/></svg>';

function renderViewer() {
  return render(
    <DiagramViewer svg={svg} source="flowchart TD" sourceFormat="MERMAID_FLOWCHART" code="test" />,
  );
}

describe('DiagramViewer — zoom/pan', () => {
  it('zooms in on Ctrl + wheel-up, clamps at 400%, and resets via the Restablecer button', async () => {
    const user = userEvent.setup();
    renderViewer();
    const viewport = screen.getByLabelText(/Vista ampliable/i);

    for (let i = 0; i < 20; i += 1) fireEvent.wheel(viewport, { deltaY: -1, ctrlKey: true });
    expect(screen.getByText('400%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restablecer' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('zooms out below 100% with Ctrl + wheel, clamps at 25%, and disables "Alejar" there', async () => {
    renderViewer();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alejar' })).not.toBeDisabled();

    const viewport = screen.getByLabelText(/Vista ampliable/i);
    fireEvent.wheel(viewport, { deltaY: 1, ctrlKey: true });
    expect(screen.getByText('75%')).toBeInTheDocument();

    for (let i = 0; i < 20; i += 1) fireEvent.wheel(viewport, { deltaY: 1, ctrlKey: true });
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alejar' })).toBeDisabled();
  });

  it('zooms via the Acercar/Alejar buttons in fixed steps', async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getByRole('button', { name: 'Acercar' }));
    expect(screen.getByText('125%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Alejar' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('pans by dragging, even at 100% zoom, and stops panning on pointer up', () => {
    renderViewer();
    const viewport = screen.getByLabelText(/Vista ampliable/i);
    const content = viewport.firstElementChild as HTMLElement;
    expect(content.style.transform).toBe('translate(0px, 0px) scale(1)');
    // jsdom doesn't implement pointer capture.
    viewport.setPointerCapture = () => undefined;

    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport, { clientX: 130, clientY: 80 });
    expect(content.style.transform).toBe('translate(30px, -20px) scale(1)');

    // Movement after pointer up must not keep panning.
    fireEvent.pointerUp(viewport);
    fireEvent.pointerMove(viewport, { clientX: 999, clientY: 999 });
    expect(content.style.transform).toBe('translate(30px, -20px) scale(1)');
  });

  it('leaves the plain wheel to the page when the diagram fits, and takes only Ctrl + wheel', () => {
    renderViewer();
    const viewport = screen.getByLabelText(/Vista ampliable/i);
    Object.defineProperty(viewport, 'clientHeight', { value: 400 });
    Object.defineProperty(viewport.firstElementChild, 'offsetHeight', { value: 100 });
    const plain = new WheelEvent('wheel', { deltaY: 40, cancelable: true });
    act(() => {
      viewport.dispatchEvent(plain);
    });
    expect(plain.defaultPrevented).toBe(false);
    expect(screen.getByText('100%')).toBeInTheDocument();
    const zoom = new WheelEvent('wheel', { deltaY: -1, ctrlKey: true, cancelable: true });
    act(() => {
      viewport.dispatchEvent(zoom);
    });
    expect(zoom.defaultPrevented).toBe(true);
    expect(screen.getByText('125%')).toBeInTheDocument();
  });

  it('scrolls a tall diagram up and down with the plain wheel, then hands over to the page', () => {
    renderViewer();
    const viewport = screen.getByLabelText(/Vista ampliable/i);
    const content = viewport.firstElementChild as HTMLElement;
    // A 1000px diagram in a 332px box (300px plus its padding): 700px of travel... minus padding.
    Object.defineProperty(viewport, 'clientHeight', { value: 332 });
    Object.defineProperty(content, 'offsetHeight', { value: 1000 });
    const wheel = (deltaY: number) => {
      const event = new WheelEvent('wheel', { deltaY, cancelable: true });
      act(() => {
        viewport.dispatchEvent(event);
      });
      return event;
    };
    expect(wheel(120).defaultPrevented).toBe(true);
    expect(content.style.transform).toBe('translate(0px, -120px) scale(1)');
    // Scrolling back up past the top stops at the top, and the page takes over.
    expect(wheel(-500).defaultPrevented).toBe(true);
    expect(content.style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(wheel(-50).defaultPrevented).toBe(false);
    // Down to the end of the diagram (1000 - 300 = 700px), never beyond it.
    expect(wheel(5000).defaultPrevented).toBe(true);
    expect(content.style.transform).toBe('translate(0px, -700px) scale(1)');
    expect(wheel(100).defaultPrevented).toBe(false);
  });
});
