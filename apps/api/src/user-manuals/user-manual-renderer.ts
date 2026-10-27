import PDFDocument from 'pdfkit';
import type { UserManualResponse } from '@caseflow-ai/contracts';

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export function renderManualHtml(manual: UserManualResponse): Buffer {
  const draft = manual.version.status !== 'APPROVED';
  const title = escape(manual.title ?? 'Manual de usuario');
  return Buffer.from(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><title>${title}</title><style>
body{font:17px/1.55 system-ui,sans-serif;color:#172033;background:#f4f7fc;margin:0}main{max-width:960px;margin:auto;padding:32px}header,section{background:white;border:1px solid #cbd5e1;border-radius:16px;padding:26px;margin:20px 0}h1,h2{line-height:1.2}a{color:#2444b7}nav a{display:block;padding:8px}small,.muted{color:#46546b}.badge{display:inline-block;background:#e0e7ff;padding:5px 12px;border-radius:20px}.flow{list-style:none;padding:0;counter-reset:step}.flow li{position:relative;margin:0 0 12px 18px;border-left:3px solid #3758ce;padding:0 0 20px 28px;counter-increment:step}.flow li:before{content:counter(step);position:absolute;left:-19px;top:0;background:#2444b7;color:white;border-radius:50%;width:34px;height:34px;text-align:center;line-height:34px;font-weight:bold}.result{background:#edf8f5;border-radius:8px;padding:12px}.draft{background:#fff3cd;padding:14px;border-radius:8px}@media print{body{background:white}main{padding:0}section{break-inside:avoid}nav{display:none}}</style></head><body><main><header><span class="badge">Guía visual · versión ${manual.version.versionNumber}</span><h1>${title}</h1>${draft ? '<p class="draft">BORRADOR: pendiente de revisión y aprobación. No es documentación oficial.</p>' : ''}${!manual.isCurrent ? '<p class="draft">Corresponde a una versión anterior del software.</p>' : ''}<p>${escape(manual.introduction)}</p><small>Software: ${escape(manual.snapshotId)} · Manual: ${escape(manual.version.id)}</small></header><nav aria-label="Tareas"><h2>¿Qué necesita hacer?</h2>${manual.tasks.map((task, index) => `<a href="#task-${index}">${escape(task.title)}</a>`).join('')}</nav>${manual.tasks.map((task, index) => `<section id="task-${index}"><span class="badge">${escape(task.roles.join(' · ') || 'Usuario autorizado')}</span><h2>${escape(task.title)}</h2><p class="muted">Esquema del flujo · acceso: <code>${escape(task.routePath)}</code></p><ol class="flow">${task.steps.map((step) => `<li><strong>${escape(step.instruction)}</strong><p class="result">Qué comprobar: ${escape(step.expectedResult)}</p></li>`).join('')}</ol></section>`).join('')}<section><h2>Si necesita ayuda</h2><p>Revise los mensajes de la pantalla, confirme que está usando la cuenta correcta y conserve una descripción del problema para el responsable de la aplicación. Evite repetir una acción si no sabe si ya se completó.</p></section></main></body></html>`,
    'utf8',
  );
}

export function renderManualPdf(manual: UserManualResponse): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      bufferPages: true,
      info: { Title: 'Manual de usuario' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc
      .fillColor('#2444b7')
      .fontSize(28)
      .text(manual.title ?? 'Manual de usuario');
    doc
      .moveDown()
      .fillColor('#172033')
      .fontSize(12)
      .text(`Guía visual · versión ${manual.version.versionNumber}`);
    if (manual.version.status !== 'APPROVED')
      doc.moveDown().fillColor('#8a4b00').text('BORRADOR · Pendiente de revisión y aprobación');
    if (!manual.isCurrent) doc.moveDown().text('Corresponde a una versión anterior del software.');
    doc.moveDown().fillColor('#172033').text(manual.introduction);
    doc.moveDown().fontSize(9).text(`Software: ${manual.snapshotId}\nManual: ${manual.version.id}`);
    doc.moveDown().fontSize(17).text('¿Qué necesita hacer?');
    manual.tasks.forEach((task) => doc.moveDown(0.3).fontSize(11).text(task.title));
    doc.moveDown().fontSize(15).text('Si necesita ayuda');
    doc
      .moveDown(0.4)
      .fontSize(11)
      .text(
        'Revise los mensajes de la pantalla y sus permisos. Si no sabe si una operación terminó, compruebe el resultado antes de repetirla y consulte al responsable de la aplicación.',
      );
    for (const task of manual.tasks) {
      doc.addPage();
      doc.fillColor('#2444b7').fontSize(20).text(task.title);
      doc
        .moveDown(0.5)
        .fillColor('#46546b')
        .fontSize(10)
        .text(
          `${task.roles.join(' · ') || 'Usuario autorizado'}\nEsquema del flujo · ${task.routePath}`,
        );
      doc.moveDown();
      task.steps.forEach((step, index) => {
        doc.fontSize(11);
        const height =
          doc.heightOfString(step.instruction, { width: 425 }) +
          doc.heightOfString(`Qué comprobar: ${step.expectedResult}`, { width: 425 }) +
          40;
        if (doc.y + height > doc.page.height - 65) doc.addPage();
        const y = doc.y;
        doc.roundedRect(42, y - 6, 505, height - 10, 9).fill('#f1f5fb');
        doc
          .moveTo(61, y + 29)
          .lineTo(61, y + height - 28)
          .lineWidth(1)
          .stroke('#b5c6eb');
        doc.circle(61, y + 12, 14).fill('#2444b7');
        doc
          .fillColor('white')
          .fontSize(11)
          .text(String(index + 1), 48, y + 6, { width: 26, align: 'center', lineBreak: false });
        doc.fillColor('#172033').fontSize(11).text(step.instruction, 90, y, { width: 425 });
        doc
          .moveDown(0.5)
          .fillColor('#365a50')
          .fontSize(10)
          .text(`Qué comprobar: ${step.expectedResult}`, 90, doc.y, { width: 425 });
        doc.moveDown(1.3);
        doc.x = 48;
      });
    }
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fillColor('#46546b')
        .fontSize(8)
        .text(`Guía visual · ${i + 1} / ${range.count}`, 48, doc.page.height - 38, {
          lineBreak: false,
        });
    }
    doc.end();
  });
}
