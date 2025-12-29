# Daily Chess Puzzles

Train your chess tactics with a new puzzle every day across 5 difficulty levels

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import DailyChessPuzzles from "@stellarin/practa-chess-puzzles";

function MyFlow() {
  return (
    <DailyChessPuzzles
      context={{ flowId: "my-flow", practaIndex: 0 }}
      onComplete={(output) => console.log("Completed:", output)}
      onSkip={() => console.log("Skipped")}
    />
  );
}
```

## Props

This component accepts the standard Practa props:

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `context` | PractaContext | Yes | Flow context from previous Practa |
| `onComplete` | (output: PractaOutput) => void | Yes | Callback when the Practa completes |
| `onSkip` | () => void | No | Optional callback to skip the Practa |

## Author

Created by Practa

## Version

1.1.2
