type ZipEntry = {
  name: string;
  data: Buffer;
};

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Buffer) => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const dateToDos = (date: Date) => {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (date.getSeconds() >> 1);
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
};

const writeUInt16 = (value: number) => {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value, 0);
  return buf;
};

const writeUInt32 = (value: number) => {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return buf;
};

export const createZipBuffer = (entries: ZipEntry[]) => {
  const fileParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.name, "utf8");
    const { dosTime, dosDate } = dateToDos(new Date());
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const localHeader = Buffer.concat([
      writeUInt32(LOCAL_FILE_HEADER_SIGNATURE),
      writeUInt16(20), // version needed
      writeUInt16(0), // flags
      writeUInt16(0), // compression method: store
      writeUInt16(dosTime),
      writeUInt16(dosDate),
      writeUInt32(crc),
      writeUInt32(size),
      writeUInt32(size),
      writeUInt16(fileName.length),
      writeUInt16(0), // extra length
      fileName,
    ]);

    fileParts.push(localHeader, entry.data);

    const centralHeader = Buffer.concat([
      writeUInt32(CENTRAL_DIRECTORY_SIGNATURE),
      writeUInt16(20), // made by
      writeUInt16(20), // version needed
      writeUInt16(0), // flags
      writeUInt16(0), // compression method: store
      writeUInt16(dosTime),
      writeUInt16(dosDate),
      writeUInt32(crc),
      writeUInt32(size),
      writeUInt32(size),
      writeUInt16(fileName.length),
      writeUInt16(0), // extra length
      writeUInt16(0), // comment length
      writeUInt16(0), // disk number
      writeUInt16(0), // internal attrs
      writeUInt32(0), // external attrs
      writeUInt32(offset),
      fileName,
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.concat([
    writeUInt32(END_OF_CENTRAL_DIRECTORY_SIGNATURE),
    writeUInt16(0), // disk number
    writeUInt16(0), // central dir start disk
    writeUInt16(entries.length),
    writeUInt16(entries.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(offset),
    writeUInt16(0), // comment length
  ]);

  return Buffer.concat([...fileParts, centralDirectory, endOfCentralDirectory]);
};