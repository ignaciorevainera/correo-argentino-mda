import zlib from "node:zlib";

/**
 * Calculates CRC32 for a Buffer using standard polynomial 0xEDB88320.
 */
function crc32(buf: Buffer): number {
  let table = (crc32 as any).table as Int32Array | undefined;
  if (!table) {
    table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    (crc32 as any).table = table;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

interface ZipEntry {
  name: string;
  data: string | Buffer;
}

/**
 * Creates an uncompressed / deflated standard PKZIP archive (PKZIP 2.0).
 */
export function createZipArchive(files: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf-8");
    const rawData = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf-8");
    const crc = crc32(rawData);
    const deflated = zlib.deflateRawSync(rawData);

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(8, 8); // compression method (8 = deflate)
    localHeader.writeUInt16LE(0, 10); // file last modification time
    localHeader.writeUInt16LE(0, 12); // file last modification date
    localHeader.writeUInt32LE(crc, 14); // crc-32
    localHeader.writeUInt32LE(deflated.length, 18); // compressed size
    localHeader.writeUInt32LE(rawData.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, deflated);

    // Central directory file header (46 bytes + name)
    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central file header signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed to extract
    centralHeader.writeUInt16LE(0, 8); // general purpose bit flag
    centralHeader.writeUInt16LE(8, 10); // compression method (8 = deflate)
    centralHeader.writeUInt16LE(0, 12); // file last modification time
    centralHeader.writeUInt16LE(0, 14); // file last modification date
    centralHeader.writeUInt32LE(crc, 16); // crc-32
    centralHeader.writeUInt32LE(deflated.length, 20); // compressed size
    centralHeader.writeUInt32LE(rawData.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // file comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(0, 38); // external file attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header
    nameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + deflated.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const h of centralHeaders) {
    centralDirSize += h.length;
  }

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  eocd.writeUInt16LE(0, 4); // number of this disk
  eocd.writeUInt16LE(0, 6); // number of the disk with the start of the central directory
  eocd.writeUInt16LE(files.length, 8); // total number of entries in the central directory on this disk
  eocd.writeUInt16LE(files.length, 10); // total number of entries in the central directory
  eocd.writeUInt32LE(centralDirSize, 12); // size of the central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // offset of start of central directory
  eocd.writeUInt16LE(0, 20); // .ZIP file comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function escapeXml(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getColLetter(idx: number): string {
  let letter = "";
  let temp = idx;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export interface XlsxCellData {
  colIdx: number;
  value: string | number | boolean | null | undefined;
  styleId?: number;
}

export interface XlsxColWidth {
  colIdx: number;
  width: number;
}

export interface XlsxSheetDefinition {
  name: string;
  headers?: string[];
  rows?: (string | number | boolean | null | undefined)[][];
  colWidths?: XlsxColWidth[];
  rawRows?: {
    rowNum: number;
    cells: XlsxCellData[];
  }[];
}

/**
 * Common style IDs used for rich formatted sheets:
 * 0: Normal / Default
 * 1: Header (Yellow fill #FFC000, Bold, Centered, Thin border)
 * 2: Header Left (Yellow fill #FFC000, Bold, Left, Thin border)
 * 3: Data Text (Regular font, Thin border)
 * 4: Data Centered (Regular font, Centered, Thin border)
 * 5: Data Percent (Format 0%, Centered, Thin border)
 * 6: Data Percent Two Decimals (Format 0.00%, Centered, Thin border)
 * 7: Cumple True (Soft Green fill #CEEFC6, Green text #006100, Centered, Thin border)
 * 8: Cumple False (Soft Red fill #FFC7CE, Red text #9C0006, Centered, Thin border)
 * 9: Status Aprobado (Soft Green fill #CEEFC6, Green text #006100, Bold, Centered, Thin border)
 * 10: Status Reprobado (Soft Red fill #FFC7CE, Red text #9C0006, Bold, Centered, Thin border)
 * 11: Summary Label (Bold, Centered, Thin border)
 */
export const XLSX_STYLE_INDEX = {
  DEFAULT: 0,
  HEADER_CENTER: 1,
  HEADER_LEFT: 2,
  DATA_TEXT: 3,
  DATA_CENTER: 4,
  DATA_PERCENT: 5,
  DATA_PERCENT_DECIMAL: 6,
  CUMPLE_TRUE: 7,
  CUMPLE_FALSE: 8,
  STATUS_APROBADO: 9,
  STATUS_REPROBADO: 10,
  SUMMARY_LABEL: 11,
  // Asistencia base styles
  ASIST_SEDE_PP: 12,
  ASIST_SEDE_MG: 13,
  ASIST_HO: 14,
  ASIST_PRESENCIAL_MG: 15,
  ASIST_PRESENCIAL_PP: 16,
  ASIST_HEADER: 17,
  ASIST_TIME: 18,
  // Eventualidades / Ausencias styles
  AUSENCIA_TRAMITE: 19,
  AUSENCIA_DEMORADO: 20,
  AUSENCIA_ENFERMO: 21,
  AUSENCIA_JUSTIFICADO: 22,
  AUSENCIA_PERMISO: 23,
  AUSENCIA_NO_JUSTIFICADO: 24,
  AUSENCIA_SIN_AVISO: 25,
  AUSENCIA_ESTUDIO: 26,
  AUSENCIA_MEDICA: 27,
  AUSENCIA_ANUAL: 28,
  AUSENCIA_UI: 29,
  AUSENCIA_GREMIAL: 30,
  AUSENCIA_PATERNIDAD: 31,
  AUSENCIA_MATERNIDAD: 32,
  AUSENCIA_FALLECIMIENTO: 33,
  AUSENCIA_ART: 34,
  // Legend headers
  LEGEND_HEADER: 35,
} as const;

function generateStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="0%"/>
    <numFmt numFmtId="165" formatCode="0.00%"/>
    <numFmt numFmtId="166" formatCode="hh:mm"/>
  </numFmts>
  <fonts count="7">
    <!-- 0: Regular Calibri 10 -->
    <font><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/></font>
    <!-- 1: Bold Calibri 10 -->
    <font><b/><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/></font>
    <!-- 2: Green font for True -->
    <font><sz val="10"/><color rgb="FF006100"/><name val="Calibri"/></font>
    <!-- 3: Red font for False -->
    <font><sz val="10"/><color rgb="FF9C0006"/><name val="Calibri"/></font>
    <!-- 4: Bold Aptos Narrow 11 Dark #242424 -->
    <font><b/><sz val="11"/><color rgb="FF242424"/><name val="Aptos Narrow"/></font>
    <!-- 5: Bold Aptos Narrow 11 Black #000000 -->
    <font><b/><sz val="11"/><color rgb="FF000000"/><name val="Aptos Narrow"/></font>
    <!-- 6: Regular Aptos Narrow 11 Black #000000 -->
    <font><sz val="11"/><color rgb="FF000000"/><name val="Aptos Narrow"/></font>
  </fonts>
  <fills count="25">
    <!-- 0: none -->
    <fill><patternFill patternType="none"/></fill>
    <!-- 1: gray125 -->
    <fill><patternFill patternType="gray125"/></fill>
    <!-- 2: Header Yellow (#FFC000) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/></patternFill></fill>
    <!-- 3: Cumple Green (#CEEFC6) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFCEEFC6"/></patternFill></fill>
    <!-- 4: Cumple Red (#FFC7CE) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill>
    <!-- 5: Soft Gray (#F2F2F2) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>
    <!-- 6: Parque Patricios Soft Purple (#E9D3F0) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE9D3F0"/></patternFill></fill>
    <!-- 7: Monte Grande / Demorado Yellow (#FFFF00) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill>
    <!-- 8: Home Office Soft Blue (#B4C7E7) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFB4C7E7"/></patternFill></fill>
    <!-- 9: Se reporta enfermo Soft Coral (#F1A983) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1A983"/></patternFill></fill>
    <!-- 10: Presencial Parque Patricios (#F2CEEF) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2CEEF"/></patternFill></fill>
    <!-- 11: Header Soft Blue (#DEEBF7) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFDEEBF7"/></patternFill></fill>
    <!-- 12: Tramite / Permiso / Estudio Gray (#D0D0D0) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFD0D0D0"/></patternFill></fill>
    <!-- 13: Ausente Justificado Green (#92D050) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF92D050"/></patternFill></fill>
    <!-- 14: Ausencia sin aviso Red (#FF0000) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFF0000"/></patternFill></fill>
    <!-- 15: Lic. Medica Orange (#E87331) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE87331"/></patternFill></fill>
    <!-- 16: Lic. Anual Soft Green (#DAF2D0) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFDAF2D0"/></patternFill></fill>
    <!-- 17: Lic. UI Medium Green (#82E391) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF82E391"/></patternFill></fill>
    <!-- 18: Lic. Gremial Orange-Yellow (#FFC000) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/></patternFill></fill>
    <!-- 19: Lic. Paternidad Pale Blue (#DAE9F8) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFDAE9F8"/></patternFill></fill>
    <!-- 20: Lic. Maternidad Soft Pink (#F2CEEF) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2CEEF"/></patternFill></fill>
    <!-- 21: Lic. Fallecimiento Light Blue (#C0E4F5) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFC0E4F5"/></patternFill></fill>
    <!-- 22: ART Sky Blue (#94DCF8) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF94DCF8"/></patternFill></fill>
    <!-- 23: Legend Header (#FFE699) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/></patternFill></fill>
  </fills>
  <borders count="2">
    <!-- 0: none -->
    <border><left/><right/><top/><bottom/></border>
    <!-- 1: Thin black borders (#000000) -->
    <border>
      <left style="thin"><color rgb="FF000000"/></left>
      <right style="thin"><color rgb="FF000000"/></right>
      <top style="thin"><color rgb="FF000000"/></top>
      <bottom style="thin"><color rgb="FF000000"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="36">
    <!-- 0: DEFAULT -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: HEADER_CENTER (Yellow, Bold, Centered, Black border) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <!-- 2: HEADER_LEFT (Yellow, Bold, Left, Black border) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 3: DATA_TEXT (Regular, Left, Black border) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 4: DATA_CENTER (Regular, Centered, Black border) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 5: DATA_PERCENT (Format 0%, Centered, Black border) -->
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 6: DATA_PERCENT_DECIMAL (Format 0.00%, Centered, Black border) -->
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 7: CUMPLE_TRUE (Soft green, Green text, Centered, Black border) -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 8: CUMPLE_FALSE (Soft red, Red text, Centered, Black border) -->
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 9: STATUS_APROBADO (Soft green, Green text, Bold, Centered, Black border) -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 10: STATUS_REPROBADO (Soft red, Red text, Bold, Centered, Black border) -->
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 11: SUMMARY_LABEL (Bold, Centered, Black border) -->
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 12: ASIST_SEDE_PP (Parque Patricios soft purple #E9D3F0, Left, Black border) -->
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 13: ASIST_SEDE_MG (Monte Grande light yellow #FFFF00, Left, Black border) -->
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <!-- 14: ASIST_HO (Home Office soft blue #B4C7E7, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="4" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 15: ASIST_PRESENCIAL_MG (Presencial Monte Grande yellow #FFFF00, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 16: ASIST_PRESENCIAL_PP (Presencial Parque Patricios #F2CEEF, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="4" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 17: ASIST_HEADER (Header Light Soft Blue #DEEBF7, Bold, Left, Black border) -->
    <xf numFmtId="0" fontId="1" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="1"/>
    </xf>
    <!-- 18: ASIST_TIME (Time format hh:mm 20, Centered, Black border) -->
    <xf numFmtId="20" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 19: AUSENCIA_TRAMITE (#D0D0D0, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 20: AUSENCIA_DEMORADO (#FFFF00, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 21: AUSENCIA_ENFERMO (#F1A983, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 22: AUSENCIA_JUSTIFICADO (#92D050, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="13" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 23: AUSENCIA_PERMISO (#D0D0D0, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 24: AUSENCIA_NO_JUSTIFICADO (#FFFF00, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 25: AUSENCIA_SIN_AVISO (#FF0000, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="14" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 26: AUSENCIA_ESTUDIO (#D0D0D0, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 27: AUSENCIA_MEDICA (#E87331, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="15" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 28: AUSENCIA_ANUAL (#DAF2D0, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="16" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 29: AUSENCIA_UI (#82E391, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="17" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 30: AUSENCIA_GREMIAL (#FFC000, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="18" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 31: AUSENCIA_PATERNIDAD (#DAE9F8, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="19" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 32: AUSENCIA_MATERNIDAD (#F2CEEF, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="20" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 33: AUSENCIA_FALLECIMIENTO (#C0E4F5, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="21" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 34: AUSENCIA_ART (#94DCF8, Bold Aptos Narrow, Centered, Black border) -->
    <xf numFmtId="0" fontId="5" fillId="22" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <!-- 35: LEGEND_HEADER (#FFE699, Bold Calibri, Centered, Black border) -->
    <xf numFmtId="0" fontId="1" fillId="23" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;
}

export function generateMultiSheetXlsxBuffer(
  sheets: XlsxSheetDefinition[],
): Buffer {
  if (sheets.length === 0) {
    sheets = [{ name: "Hoja 1", headers: [], rows: [] }];
  }

  const sheetEntries: { sheetId: number; name: string; xml: string }[] = [];
  const contentTypesOverrides: string[] = [];
  const workbookSheetTags: string[] = [];
  const workbookRelsTags: string[] = [];

  // Register styles in workbook relations (rIdStyles)
  const stylesRelId = `rIdStyles`;
  workbookRelsTags.push(
    `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
  );
  contentTypesOverrides.push(
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
  );

  const existingSheetNames = new Set<string>();

  sheets.forEach((sheetDef, idx) => {
    const sheetId = idx + 1;
    const rId = `rId${sheetId}`;

    let baseName = (sheetDef.name || `Hoja ${sheetId}`)
      .replace(/[\\/*?:\[\]]/g, "_")
      .trim()
      .substring(0, 31);
    if (!baseName) baseName = `Hoja ${sheetId}`;

    let uniqueName = baseName;
    let counter = 1;
    while (existingSheetNames.has(uniqueName.toLowerCase())) {
      const suffix = `_${counter}`;
      uniqueName = `${baseName.substring(0, 31 - suffix.length)}${suffix}`;
      counter++;
    }
    existingSheetNames.add(uniqueName.toLowerCase());

    const safeSheetName = escapeXml(uniqueName);

    workbookSheetTags.push(
      `<sheet name="${safeSheetName}" sheetId="${sheetId}" r:id="${rId}"/>`,
    );
    workbookRelsTags.push(
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetId}.xml"/>`,
    );
    contentTypesOverrides.push(
      `<Override PartName="/xl/worksheets/sheet${sheetId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    );

    let colsXml = "";
    if (sheetDef.colWidths && sheetDef.colWidths.length > 0) {
      colsXml += "<cols>";
      sheetDef.colWidths.forEach((cw) => {
        const colNum = cw.colIdx + 1;
        colsXml += `<col min="${colNum}" max="${colNum}" width="${cw.width}" customWidth="1"/>`;
      });
      colsXml += "</cols>";
    }

    let sheetDataXml = "";

    if (sheetDef.rawRows && sheetDef.rawRows.length > 0) {
      const sortedRows = [...sheetDef.rawRows].sort((a, b) => a.rowNum - b.rowNum);
      sortedRows.forEach((r) => {
        sheetDataXml += `<row r="${r.rowNum}">`;
        const sortedCells = [...r.cells].sort((a, b) => a.colIdx - b.colIdx);
        sortedCells.forEach((c) => {
          const cellRef = `${getColLetter(c.colIdx)}${r.rowNum}`;
          const val = c.value;
          const styleAttr = typeof c.styleId === "number" ? ` s="${c.styleId}"` : "";

          if (val === null || val === undefined || val === "") {
            if (styleAttr) {
              sheetDataXml += `<c r="${cellRef}"${styleAttr}/>`;
            }
          } else if (typeof val === "number") {
            sheetDataXml += `<c r="${cellRef}"${styleAttr}><v>${val}</v></c>`;
          } else if (typeof val === "boolean") {
            sheetDataXml += `<c r="${cellRef}"${styleAttr} t="b"><v>${val ? 1 : 0}</v></c>`;
          } else {
            const text = escapeXml(val);
            sheetDataXml += `<c r="${cellRef}"${styleAttr} t="inlineStr"><is><t>${text}</t></is></c>`;
          }
        });
        sheetDataXml += "</row>";
      });
    } else {
      const headers = sheetDef.headers || [];
      const rows = sheetDef.rows || [];

      if (headers.length > 0) {
        sheetDataXml += `<row r="1" spans="1:${headers.length}">`;
        headers.forEach((h, colIdx) => {
          const cellRef = `${getColLetter(colIdx)}1`;
          sheetDataXml += `<c r="${cellRef}" s="1" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`;
        });
        sheetDataXml += "</row>";
      }

      rows.forEach((row, rowIdx) => {
        const rowNum = (headers.length > 0 ? 1 : 0) + rowIdx + 1;
        sheetDataXml += `<row r="${rowNum}" spans="1:${row.length}">`;
        row.forEach((val, colIdx) => {
          const cellRef = `${getColLetter(colIdx)}${rowNum}`;
          if (val === null || val === undefined) {
            sheetDataXml += `<c r="${cellRef}" s="3"/>`;
          } else if (typeof val === "number") {
            sheetDataXml += `<c r="${cellRef}" s="4"><v>${val}</v></c>`;
          } else if (typeof val === "boolean") {
            sheetDataXml += `<c r="${cellRef}" s="4" t="b"><v>${val ? 1 : 0}</v></c>`;
          } else {
            const text = escapeXml(val);
            sheetDataXml += `<c r="${cellRef}" s="3" t="inlineStr"><is><t>${text}</t></is></c>`;
          }
        });
        sheetDataXml += "</row>";
      });
    }

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>
    ${sheetDataXml}
  </sheetData>
</worksheet>`;

    sheetEntries.push({
      sheetId,
      name: safeSheetName,
      xml: sheetXml,
    });
  });

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${contentTypesOverrides.join("\n  ")}
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRelsTags.join("\n  ")}
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${workbookSheetTags.join("\n    ")}
  </sheets>
</workbook>`;

  const zipFiles: ZipEntry[] = [
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: relsXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/styles.xml", data: generateStylesXml() },
  ];

  sheetEntries.forEach((s) => {
    zipFiles.push({
      name: `xl/worksheets/sheet${s.sheetId}.xml`,
      data: s.xml,
    });
  });

  return createZipArchive(zipFiles);
}

/**
 * Generates a valid Microsoft Excel (.xlsx) file Buffer from a single sheet name, headers, and rows.
 */
export function generateXlsxBuffer(
  sheetName: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): Buffer {
  return generateMultiSheetXlsxBuffer([
    {
      name: sheetName,
      headers,
      rows,
    },
  ]);
}

