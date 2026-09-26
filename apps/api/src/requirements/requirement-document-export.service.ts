import { Injectable, NotFoundException } from '@nestjs/common';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../database/prisma.service';
import { RequirementsService } from './requirements.service';

export type RequirementDocumentFormat = 'pdf' | 'docx';

@Injectable()
export class RequirementDocumentExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requirements: RequirementsService,
  ) {}

  async generate(projectId: string, format: RequirementDocumentFormat): Promise<Buffer> {
    const [project, { items }] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      this.requirements.listApproved(projectId),
    ]);
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    return format === 'pdf'
      ? this.toPdf(project.name, items)
      : Packer.toBuffer(this.toDocx(project.name, items));
  }

  private toDocx(
    projectName: string,
    requirements: Awaited<ReturnType<RequirementsService['listApproved']>>['items'],
  ) {
    const paragraphs: Paragraph[] = [
      new Paragraph({ text: 'Especificación de requisitos', heading: HeadingLevel.TITLE }),
      labeledParagraph('Proyecto', projectName),
      new Paragraph({
        text: `Exportado: ${new Date().toLocaleDateString('es-EC')}`,
      }),
      new Paragraph({
        text: 'Documento derivado de las versiones aprobadas. La información estructurada de CASEFlow AI es la fuente canónica.',
      }),
      new Paragraph({ text: 'Requisitos aprobados', heading: HeadingLevel.HEADING_1 }),
    ];

    if (requirements.length === 0)
      paragraphs.push(new Paragraph({ text: 'El proyecto aún no tiene requisitos aprobados.' }));

    for (const item of requirements) {
      const requirement = item.requirement;
      paragraphs.push(
        new Paragraph({
          text: `${item.code} — ${requirement.name}`,
          heading: HeadingLevel.HEADING_2,
        }),
        labeledParagraph(
          'Tipo',
          requirement.requirementType === 'FUNCTIONAL' ? 'Funcional' : 'No funcional',
        ),
        labeledParagraph('Prioridad', priorityLabel(requirement.priority)),
        labeledParagraph('Versión aprobada', `v${item.version.versionNumber}`),
        labeledParagraph('Descripción', requirement.description),
      );
      appendDocxList(paragraphs, 'Actores', requirement.actors);
      appendDocxList(paragraphs, 'Precondiciones', requirement.preconditions);
      appendDocxList(paragraphs, 'Postcondiciones', requirement.postconditions);
    }

    return new Document({
      sections: [{ properties: {}, children: paragraphs }],
      creator: 'CASEFlow AI',
      title: `Requisitos — ${projectName}`,
    });
  }

  private toPdf(
    projectName: string,
    requirements: Awaited<ReturnType<RequirementsService['listApproved']>>['items'],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margin: 54,
        info: { Title: `Requisitos — ${projectName}`, Author: 'CASEFlow AI' },
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);

      document.fontSize(20).text('Especificación de requisitos');
      document.moveDown(0.5).fontSize(12).text(`Proyecto: ${projectName}`);
      document.fontSize(10).text(`Exportado: ${new Date().toLocaleDateString('es-EC')}`);
      document
        .moveDown()
        .fontSize(9)
        .text(
          'Documento derivado de las versiones aprobadas. La información estructurada de CASEFlow AI es la fuente canónica.',
        );
      document.moveDown().fontSize(15).text('Requisitos aprobados');

      if (requirements.length === 0) {
        document.moveDown().fontSize(11).text('El proyecto aún no tiene requisitos aprobados.');
      }
      for (const item of requirements) {
        const requirement = item.requirement;
        document.moveDown().fontSize(13).text(`${item.code} — ${requirement.name}`);
        document
          .fontSize(10)
          .text(
            `Tipo: ${requirement.requirementType === 'FUNCTIONAL' ? 'Funcional' : 'No funcional'}  |  Prioridad: ${priorityLabel(requirement.priority)}  |  Versión aprobada: v${item.version.versionNumber}`,
          );
        document.moveDown(0.3).fontSize(10).text(`Descripción: ${requirement.description}`);
        appendPdfList(document, 'Actores', requirement.actors);
        appendPdfList(document, 'Precondiciones', requirement.preconditions);
        appendPdfList(document, 'Postcondiciones', requirement.postconditions);
      }
      document.end();
    });
  }
}

function priorityLabel(priority: string): string {
  return priority === 'HIGH' ? 'Alta' : priority === 'MEDIUM' ? 'Media' : 'Baja';
}

function labeledParagraph(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)],
  });
}

function appendDocxList(paragraphs: Paragraph[], label: string, values: string[]): void {
  if (values.length === 0) return;
  paragraphs.push(new Paragraph({ children: [new TextRun({ text: `${label}:`, bold: true })] }));
  for (const value of values) paragraphs.push(new Paragraph({ text: value, bullet: { level: 0 } }));
}

function appendPdfList(document: PDFKit.PDFDocument, label: string, values: string[]): void {
  if (values.length === 0) return;
  document.moveDown(0.25).fontSize(10).text(`${label}:`);
  for (const value of values) document.fontSize(9).text(`• ${value}`, { indent: 12 });
}
