# Habit Tracker

A beautiful daily habit tracker to help you build positive routines

## Installation

This Practa component is designed for the Stellarin app.

## Usage

```tsx
import HabitTracker from "@stellarin/practa-practa-habit-tracker";

function MyFlow() {
  return (
    <HabitTracker
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

Created by Mike Messenger

## Version

1.6.4
