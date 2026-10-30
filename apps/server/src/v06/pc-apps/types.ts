/**
 * Typdefinitionen für PC-Apps in Gruppen (v06 / A28)
 */

export interface WindowMatch {
  titleRegex?: string;
  processName?: string;
}

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PcAppCastMessage =
  | {
      type: "frame";
      data: string; // Base64 JPEG/PNG
      width: number;
      height: number;
      fps?: number;
      method?: "PrintWindow" | "GraphicsCapture" | "BitBlt";
    }
  | {
      type: "target";
      title: string;
      hwnd: number;
      processName: string;
    }
  | {
      type: "status";
      running: boolean;
      found: boolean;
      title?: string;
      bounds?: WindowRect;
    }
  | {
      type: "problem";
      text: string;
    }
  | {
      type: "sent";
    };

export interface PcAppInputEvent {
  type: "mouse" | "wheel" | "key" | "text" | "prompt";
  event?: "pressed" | "released" | "moved" | "down" | "up";
  x?: number;
  y?: number;
  button?: "left" | "right" | "middle";
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  key?: string;
  code?: string;
  text?: string;
  windowsVirtualKeyCode?: number;
  modifiers?: number;
  submit?: boolean;
}
