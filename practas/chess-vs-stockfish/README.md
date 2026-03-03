# Chess

Play chess against Stockfish 16 engine with adjustable difficulty

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import Chess from "@stellarin/practa-chess-vs-stockfish";

function MyFlow() {
  return (
    <Chess
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

Created by Your Name

## Version

1.0.1
