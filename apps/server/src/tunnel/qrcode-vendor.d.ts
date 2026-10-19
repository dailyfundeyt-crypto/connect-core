declare const qrcode: (typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H") => {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  createSvgTag(options: { cellSize?: number; margin?: number; scalable?: boolean }): string;
};
export default qrcode;
