# Daily Sudoku

A calming Sudoku puzzle game to exercise your mind and focus

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import DailySudoku from "@stellarin/practa-daily-sudoku";

function MyFlow() {
  return (
    <DailySudoku
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

Created by Practa Creator

## Version

1.3.2
