import React from "react";
import { Composition, staticFile } from "remotion";
import { Demo, FPS, Timeline, totalFrames } from "./Demo";

export const Root: React.FC = () => (
  <Composition
    id="Demo"
    component={Demo}
    width={1920}
    height={1080}
    fps={FPS}
    durationInFrames={FPS}
    defaultProps={{ timeline: { engine: "", scenes: [] } as Timeline }}
    calculateMetadata={async () => {
      const timeline: Timeline = await (await fetch(staticFile("timeline.json"))).json();
      return { durationInFrames: totalFrames(timeline), props: { timeline } };
    }}
  />
);
