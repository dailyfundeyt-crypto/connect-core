/**
 * T3-Bridge — Avatar-Service (Lane A31).
 *
 * Der Service kennt drei Fragen:
 *  - Welchen Avatar hat dieser Agent? (gelesen, notfalls abgeleitet und gespeichert)
 *  - Welchen Avatar soll dieser Agent bekommen? (gesetzt, vom Besitzer)
 *  - Welchen Avatar bekommt ein neuer Bot? (einmal gewürfelt)
 *
 * Die Ableitung ist der Kern: ein Agent, dessen Avatar noch nie gespeichert wurde, bekommt
 * einen aus seiner ID abgeleiteten. Der ist stabil — derselbe Agent sieht immer dasselbe
 * Maskottchen — und er wird beim ersten Lesen in die Tabelle geschrieben, damit er dauerhaft
 * ist und nicht bei jedem Neuaufbau neu berechnet werden muss.
 */

import {
  type AgentAvatar,
  type AvatarColor,
  type AvatarShape,
  isAvatarColor,
  isAvatarShape,
} from "../t3-bridge/contracts";
import {
  type AvatarDefaults,
  defaultAvatarFor,
  isAvatarExpression,
  randomAvatar,
} from "./defaults";
import type { AgentAvatarStore } from "./store";

export type AgentAvatarPatch = {
  shape?: unknown;
  color?: unknown;
  expression?: unknown;
};

export class AvatarValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "AvatarValidationError";
    this.field = field;
  }
}

export type AgentAvatarServiceOptions = {
  store: AgentAvatarStore;
  /** Ob die Farbe mit dem Hash variiert. Aus = Orange für alle (Stefan-Default). */
  colorFromHash?: boolean;
  /** Quelle des Zufalls, damit ein Test würfeln kann. */
  random?: () => number;
};

export class AgentAvatarService {
  readonly #store: AgentAvatarStore;
  readonly #colorFromHash: boolean;
  readonly #random: () => number;

  constructor(options: AgentAvatarServiceOptions) {
    this.#store = options.store;
    this.#colorFromHash = options.colorFromHash ?? false;
    this.#random = options.random ?? Math.random;
  }

  /**
   * Der Avatar eines Agenten.
   *
   * Ohne gespeicherte Zeile wird der aus der ID abgeleitete Standard genommen und gespeichert.
   * Das ist der Punkt, an dem ein bestehender Bot dauerhaft sein Maskottchen bekommt.
   */
  async get(agentId: string): Promise<AgentAvatar> {
    const stored = await this.#store.get(agentId);
    if (stored) return this.#toAvatar(stored);

    const derived = defaultAvatarFor(agentId, {
      colorFromHash: this.#colorFromHash,
    });
    const saved = await this.#store.save(
      agentId,
      { ...derived, expression: null },
      { createOnly: true },
    );
    return this.#toAvatar(saved);
  }

  /**
   * Setzt Form, Farbe oder Ausdruck.
   *
   * Nur die genannten Felder werden geändert. Ein Feld, das nicht genannt ist, bleibt, wie es
   * war — auch wenn es vorher gar nicht gesetzt war.
   */
  async set(agentId: string, patch: AgentAvatarPatch): Promise<AgentAvatar> {
    const current = await this.get(agentId);

    const shape = this.#readShape(patch.shape, current.shape);
    const color = this.#readColor(patch.color, current.color);
    const expression = this.#readExpression(
      patch.expression,
      current.expression,
    );

    const saved = await this.#store.save(agentId, {
      shape,
      color,
      expression,
    });
    return this.#toAvatar(saved);
  }

  /**
   * Vergibt einem neuen Bot einen zufälligen Avatar.
   *
   * Einmal gewürfelt, dann gespeichert: ab da bleibt er. Ein Bot, der bei jedem Anzeigen neu
   * gewürfelt würde, wäre kein Zufallsavatar, sondern ein Flackern.
   */
  async assignRandom(agentId: string): Promise<AgentAvatar> {
    const picked: AvatarDefaults = randomAvatar({
      random: this.#random,
      colorFromHash: this.#colorFromHash,
    });
    const saved = await this.#store.save(agentId, {
      ...picked,
      expression: null,
    });
    return this.#toAvatar(saved);
  }

  #readShape(value: unknown, fallback: AvatarShape): AvatarShape {
    if (value === undefined) return fallback;
    if (!isAvatarShape(value)) {
      throw new AvatarValidationError("shape", "Unknown avatar shape.");
    }
    return value;
  }

  #readColor(value: unknown, fallback: AvatarColor): AvatarColor {
    if (value === undefined) return fallback;
    if (!isAvatarColor(value)) {
      throw new AvatarValidationError("color", "Unknown avatar color.");
    }
    return value;
  }

  #readExpression(value: unknown, fallback: string | undefined): string | null {
    if (value === undefined) return fallback ?? null;
    if (value === null) return null;
    if (!isAvatarExpression(value)) {
      throw new AvatarValidationError(
        "expression",
        "Unknown avatar expression.",
      );
    }
    return value;
  }

  #toAvatar(stored: {
    agentId: string;
    shape: string;
    color: string;
    expression: string | null;
    updatedAt: string;
  }): AgentAvatar {
    const shape = isAvatarShape(stored.shape) ? stored.shape : "circle";
    const color = isAvatarColor(stored.color) ? stored.color : "orange";
    const expression = isAvatarExpression(stored.expression)
      ? stored.expression
      : undefined;

    return {
      agentId: stored.agentId,
      shape,
      color,
      ...(expression ? { expression } : {}),
      updatedAt: stored.updatedAt,
    };
  }
}

export function createAgentAvatarService(
  options: AgentAvatarServiceOptions,
): AgentAvatarService {
  return new AgentAvatarService(options);
}
