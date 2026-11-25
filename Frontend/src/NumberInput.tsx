import { useEffect, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min"> & {
  value: number;
  onChange: (n: number) => void;
  min?: number;
};

/** A number box people can clear and retype. A plain controlled number input snaps back to the old
 *  value when emptied, so deleting "1" and typing "2" gave "12". Here the box may be empty while
 *  typing; leaving it empty (or below `min`) puts `min` back. The phone shows its number keypad. */
export default function NumberInput({ value, onChange, min, onBlur, onFocus, ...rest }: Props) {
  const [text, setText] = useState(String(value));
  // follow outside changes (e.g. a saved value loading) without fighting the person typing
  useEffect(() => { if (text === "" ? false : Number(text) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      value={text}
      onFocus={(e) => { e.target.select(); onFocus?.(e); }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && (min === undefined || n >= min)) onChange(n);
      }}
      onBlur={(e) => {
        const n = Number(text);
        if (text === "" || !Number.isFinite(n) || (min !== undefined && n < min)) {
          const fixed = min ?? 0;
          setText(String(fixed));
          onChange(fixed);
        }
        onBlur?.(e);
      }}
    />
  );
}
