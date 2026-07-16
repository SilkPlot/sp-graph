/** Small internal helper: a centered "not yet implemented" label for stubs. */
import { type Component } from "solid-js";
import { useChartBounds } from "@silkplot/solid";

export const Placeholder: Component<{ label: string }> = (props) => {
  const bounds = useChartBounds();
  return (
    <text
      x={bounds().innerWidth / 2}
      y={bounds().innerHeight / 2}
      text-anchor="middle"
      dy="0.32em"
      fill="currentColor"
      fill-opacity="0.5"
      font-size="13"
    >
      {props.label}
    </text>
  );
};
