import { RclwebMark } from "@/components/logo";
import { GraphField } from "@/components/graph-field";

export function HomePage() {
  return (
    <div className="home">
      <header className="home-head">
        <RclwebMark size="nav" />
        <h1 className="home-title">Browser access to ROS 2</h1>
      </header>
      <GraphField />
    </div>
  );
}
