/**
 * The colour-scheme switcher — scheme only, deliberately.
 *
 * The theme resolves scheme × contrast as four combinations, but the two axes
 * have different owners. Scheme is a preference this page may offer, through
 * the theme's own `data-sp-theme` opt-in. Contrast is media-only by the
 * theme's recorded decision — a page must never offer LESS contrast than the
 * user's system asked for — so there is no contrast toggle here and adding
 * one would contradict the contract this site exists to demonstrate. The
 * high-contrast palettes engage through `prefers-contrast: more`, on top of
 * whichever scheme is active.
 *
 * "System" removes the attribute rather than storing a resolved value, so the
 * page keeps following the OS live. The early-boot script in `index.html`
 * re-applies a saved explicit choice before first paint.
 */
import { createSignal, For, onMount, type Component } from "solid-js";
import { THEME_ATTR } from "@silkplot/theme";

type Choice = "system" | "light" | "dark";

const STORAGE_KEY = "sp-theme";

const CHOICES: readonly { value: Choice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function apply(choice: Choice): void {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute(THEME_ATTR);
  } else {
    root.setAttribute(THEME_ATTR, choice);
  }
}

export const ThemeSwitcher: Component = () => {
  const [choice, setChoice] = createSignal<Choice>("system");

  onMount(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      setChoice(saved);
      apply(saved);
    }
  });

  const pick = (value: Choice): void => {
    setChoice(value);
    apply(value);
    if (value === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
    }
  };

  return (
    <fieldset class="switcher">
      <legend class="switcher__legend">Colour scheme</legend>
      <For each={CHOICES}>
        {(c) => (
          <button
            type="button"
            class="switcher__btn sp-focusable"
            aria-pressed={choice() === c.value}
            onClick={() => pick(c.value)}
          >
            {c.label}
          </button>
        )}
      </For>
    </fieldset>
  );
};
