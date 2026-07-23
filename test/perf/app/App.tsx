/**
 * The performance workload page.
 *
 * One workload per page load, chosen by query string:
 *
 *     /?workload=w-a
 *     /?workload=w-d&semantics=decorative
 *
 * One per load rather than a gallery, for the same reason the visual fixture
 * renders one chart at a time and for one more: a page holding all four
 * workloads would have 48 charts and 86,400 points mounted while measuring the
 * four-series case, and every number would be a number about the other three.
 *
 * An unknown workload renders an error rather than falling back to a default.
 * A harness that quietly measured `w-a` when it was asked for `w-d` would
 * produce a full set of plausible numbers for the wrong thing, and the appendix
 * would record them under the wrong heading.
 */
import { Match, Switch, type Component } from "solid-js";
import { WorkloadA } from "./WorkloadA";
import { WorkloadB } from "./WorkloadB";
import { WorkloadC } from "./WorkloadC";
import { WorkloadD } from "./WorkloadD";
import { isWorkload, WORKLOADS } from "./workloads";

export const App: Component = () => {
  const requested = new URLSearchParams(location.search).get("workload");
  const workload = isWorkload(requested) ? requested : undefined;

  return (
    <div id="surface">
      <Switch
        fallback={
          <p data-perf-error="">
            Unknown workload {JSON.stringify(requested)}. Expected one of: {WORKLOADS.join(", ")}.
          </p>
        }
      >
        <Match when={workload === "w-a"}>
          <WorkloadA />
        </Match>
        <Match when={workload === "w-b"}>
          <WorkloadB />
        </Match>
        <Match when={workload === "w-c"}>
          <WorkloadC />
        </Match>
        <Match when={workload === "w-d"}>
          <WorkloadD />
        </Match>
      </Switch>
    </div>
  );
};
