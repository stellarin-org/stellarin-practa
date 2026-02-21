# Chess Puzzles

Train your chess tactics with focused mini-board puzzles or full 8x8 board puzzles across 5 difficulty levels

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import ChessPuzzles from "@stellarin/practa-chess-puzzles";

function MyFlow() {
  return (
    <ChessPuzzles
      context={{ flowId: "my-flow", practaIndex: 0 }}
      onComplete={(output) => console.log("Completed:", output)}
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

## Author

Created by Practa

## Version

1.4.6
