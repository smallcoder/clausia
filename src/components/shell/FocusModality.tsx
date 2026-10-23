"use client";
/**
 * Tells the CSS whether the last input was the keyboard: html[data-input="key"] after a key press, removed on a pointer press.
 * A text field matches :focus-visible even when it is clicked, so this is the only way to give the keyboard a slightly stronger focus ring than the mouse (globals.css «Focus»).
 */
import { useEffect } from "react";

export function FocusModality() {
  useEffect(() => {
    const root = document.documentElement;
    const key = (e: KeyboardEvent) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) root.dataset.input = "key"; };
    const pointer = () => { delete root.dataset.input; };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("pointerdown", pointer, true); root.removeAttribute("data-input"); };
  }, []);
  return null;
}
