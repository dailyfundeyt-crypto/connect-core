import { describe, expect, test, mock } from "bun:test";
import { LiveControlToggle } from "./liveControlToggle";

describe("LiveControlToggle v06 (A02)", () => {
  test("Toggle-Steuern ruft takeControl genau einmal auf", () => {
    const takeControl = mock(() => {});
    const releaseControl = mock(() => {});

    // Instanz mit control = false (Modus: Zuschauen aktiv)
    const element = LiveControlToggle({
      control: false,
      takeControl,
      releaseControl,
    });

    expect(element).toBeDefined();
    expect(element.props["aria-label"]).toBe("Modus");
    expect(element.props.role).toBe("group");

    const children = element.props.children;
    expect(children.length).toBe(2);

    const [watchButton, controlButton] = children;

    // Pruefe Steuern-Button
    expect(controlButton.props["aria-label"]).toBe("Steuern");
    expect(controlButton.props["aria-pressed"]).toBe(false);
    expect(controlButton.props.tabIndex).toBe(0);

    // Klick auf Steuern
    controlButton.props.onClick();
    expect(takeControl).toHaveBeenCalledTimes(1);
    expect(releaseControl).toHaveBeenCalledTimes(0);
  });

  test("Toggle-Steuern ruft takeControl NICHT auf, wenn Steuerung bereits aktiv ist", () => {
    const takeControl = mock(() => {});
    const releaseControl = mock(() => {});

    const element = LiveControlToggle({
      control: true,
      takeControl,
      releaseControl,
    });

    const [, controlButton] = element.props.children;
    expect(controlButton.props["aria-pressed"]).toBe(true);

    controlButton.props.onClick();
    expect(takeControl).toHaveBeenCalledTimes(0);
  });

  test("Toggle-Zuschauen ruft releaseControl genau einmal auf, wenn Steuerung aktiv war", () => {
    const takeControl = mock(() => {});
    const releaseControl = mock(() => {});

    const element = LiveControlToggle({
      control: true,
      takeControl,
      releaseControl,
    });

    const [watchButton] = element.props.children;
    expect(watchButton.props["aria-label"]).toBe("Zuschauen");
    expect(watchButton.props["aria-pressed"]).toBe(false);
    expect(watchButton.props.tabIndex).toBe(0);

    // Klick auf Zuschauen
    watchButton.props.onClick();
    expect(releaseControl).toHaveBeenCalledTimes(1);
    expect(takeControl).toHaveBeenCalledTimes(0);
  });

  test("Tastatur-Navigation: Enter und Leertaste loesen takeControl aus", () => {
    const takeControl = mock(() => {});
    const releaseControl = mock(() => {});

    const element = LiveControlToggle({
      control: false,
      takeControl,
      releaseControl,
    });

    const [, controlButton] = element.props.children;

    let prevented = false;
    const fakeEventEnter = {
      key: "Enter",
      preventDefault: () => {
        prevented = true;
      },
    };

    controlButton.props.onKeyDown(fakeEventEnter);
    expect(prevented).toBe(true);
    expect(takeControl).toHaveBeenCalledTimes(1);

    prevented = false;
    const fakeEventSpace = {
      key: " ",
      preventDefault: () => {
        prevented = true;
      },
    };
    controlButton.props.onKeyDown(fakeEventSpace);
    expect(prevented).toBe(true);
    expect(takeControl).toHaveBeenCalledTimes(2);
  });

  test("Beide Buttons sind per Tab erreichbar (tabIndex = 0)", () => {
    const element = LiveControlToggle({
      control: false,
      takeControl: () => {},
      releaseControl: () => {},
    });

    const [watchButton, controlButton] = element.props.children;
    expect(watchButton.props.tabIndex).toBe(0);
    expect(controlButton.props.tabIndex).toBe(0);
  });
});
