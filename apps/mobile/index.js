import { registerRootComponent } from "expo";
import { ExpoRoot } from "expo-router";

// require.context args: (directory, useSubdirectories, regExp)
const ctx = require.context("./app", true, /^\.\/.*\.[jt]sx?$/);

export function App() {
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
