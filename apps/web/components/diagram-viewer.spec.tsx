import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

// Three entities in a chain: ent1 — ent2 — ent3, as PlantUML marks them up.
const graph =
  '<svg xmlns="http://www.w3.org/2000/svg">' +
  '<g class="entity" id="ent1"><ellipse/></g><g class="entity" id="ent2"><ellipse/></g>' +
  '<g class="entity" id="ent3"><ellipse/></g>' +
  '<g class="link" data-entity-1="ent1" data-entity-2="ent2" id="l1"><path id="A1-U1" d="M0 0"/></g>' +
  '<g class="link" data-entity-1="ent2" data-entity-2="ent3" id="l2"><path id="U1-U2" d="M0 0"/></g>' +
  '</svg>';

describe('DiagramViewer — highlighting connections', () => {
  const setup = () => {
    const view = render(
      <DiagramViewer svg={graph} source="@startuml" sourceFormat="PLANTUML" code="test" />,
    );
    const viewport = screen.getByLabelText(/Vista ampliable/i);
    // jsdom doesn't implement pointer capture.
    viewport.setPointerCapture = () => undefined;
    const el = (id: string) => view.container.querySelector<SVGElement>(`#${id}`)!;
    return { viewport, el };
  };

  it('fades what is not connected to the element pointed at, and restores it on leaving', () => {
    const { viewport, el } = setup();
    fireEvent.pointerMove(el('ent1'));
    expect(el('ent3').style.opacity).toBe('0.15');
    expect(el('l2').style.opacity).toBe('0.06');
    expect(el('ent2').style.opacity).toBe('');
    expect(el('l1').style.opacity).toBe('');
    expect(el('l1').querySelector('path')!.style.strokeWidth).toBe('2.5px');
    fireEvent.pointerLeave(viewport);
    expect(el('ent3').style.opacity).toBe('');
    expect(el('l2').style.opacity).toBe('');
    expect(el('l1').querySelector('path')!.style.strokeWidth).toBe('');
  });

  it('keeps the highlight of a clicked element until another click, and drops it on the background', () => {
    const { viewport, el } = setup();
    fireEvent.pointerDown(el('ent1'), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(el('ent1'), { clientX: 12, clientY: 11 });
    fireEvent.pointerLeave(viewport);
    expect(el('ent3').style.opacity).toBe('0.15');
    // Pointing elsewhere does not move it while it is kept.
    fireEvent.pointerMove(el('ent3'));
    expect(el('ent1').style.opacity).toBe('');
    expect(el('ent3').style.opacity).toBe('0.15');
    expect(screen.getByRole('button', { name: 'Quitar resaltado' })).toBeInTheDocument();

    fireEvent.pointerDown(el('ent3'), { button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(el('ent3'), { clientX: 50, clientY: 50 });
    expect(el('ent1').style.opacity).toBe('0.15');
    expect(el('ent3').style.opacity).toBe('');

    fireEvent.pointerDown(viewport, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(viewport, { clientX: 5, clientY: 5 });
    expect(el('ent1').style.opacity).toBe('');
    expect(screen.queryByRole('button', { name: 'Quitar resaltado' })).not.toBeInTheDocument();
  });

  it('does not take a drag for a click', () => {
    const { el } = setup();
    fireEvent.pointerDown(el('ent1'), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(el('ent1'), { clientX: 60, clientY: 10 });
    fireEvent.pointerUp(el('ent1'), { clientX: 60, clientY: 10 });
    expect(screen.queryByRole('button', { name: 'Quitar resaltado' })).not.toBeInTheDocument();
  });

  it('does nothing, and does not mention it, for a diagram without connection markup', () => {
    render(
      <DiagramViewer svg={svg} source="flowchart TD" sourceFormat="MERMAID_FLOWCHART" code="t" />,
    );
    expect(screen.queryByText(/para ver sus conexiones/)).not.toBeInTheDocument();
  });
});

describe('DiagramViewer — fullscreen mode', () => {
  it('opens fullscreen, locks body scroll, shows header with actions and closes via button', async () => {
    const user = userEvent.setup();
    render(
      <DiagramViewer
        svg={svg}
        source="flowchart TD"
        sourceFormat="MERMAID_FLOWCHART"
        code="DIAG-01"
        caption="Diagrama de arquitectura"
        pngUrl="/api/diagrams/1/png"
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');

    // Open fullscreen
    await user.click(screen.getByRole('button', { name: 'Ver en pantalla completa' }));
    const dialog = screen.getByRole('dialog', { name: 'Diagrama de arquitectura' });
    expect(dialog).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    // Header info & action buttons
    const header = within(dialog).getByRole('banner');
    expect(header).toHaveTextContent('Diagrama de arquitectura');
    expect(header).toHaveTextContent('DIAG-01 · MERMAID_FLOWCHART');
    expect(within(header).getByRole('button', { name: 'Descargar SVG' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Descargar PNG' })).toBeInTheDocument();
    expect(
      within(header).getByRole('button', { name: 'Descargar código fuente' }),
    ).toBeInTheDocument();

    // Close via Cerrar button
    await user.click(within(header).getByRole('button', { name: 'Cerrar pantalla completa' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes fullscreen mode with the Escape key', async () => {
    const user = userEvent.setup();
    render(
      <DiagramViewer
        svg={svg}
        source="flowchart TD"
        sourceFormat="MERMAID_FLOWCHART"
        code="DIAG-01"
        caption="Diagrama general"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ver en pantalla completa' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });
});
