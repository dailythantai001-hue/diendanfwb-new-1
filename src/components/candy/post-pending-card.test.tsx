import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostPendingCard } from "./post-pending-card";

describe("post approval notice lifetime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("expires exactly six seconds after opening", () => {
    const onClose = vi.fn();
    render(<PostPendingCard open onClose={onClose} />);
    act(() => vi.advanceTimersByTime(5999));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not restart six seconds when the parent renders a new callback", () => {
    const first = vi.fn();
    const next = vi.fn();
    const view = render(<PostPendingCard open onClose={first} />);
    act(() => vi.advanceTimersByTime(3000));
    view.rerender(<PostPendingCard open onClose={next} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(first).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not schedule success expiry unless opened", () => {
    const onClose = vi.fn();
    render(<PostPendingCard open={false} onClose={onClose} />);
    act(() => vi.advanceTimersByTime(6000));
    expect(onClose).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels expiry on unmount", () => {
    const onClose = vi.fn();
    const view = render(<PostPendingCard open onClose={onClose} />);
    view.unmount();
    act(() => vi.advanceTimersByTime(6000));
    expect(onClose).not.toHaveBeenCalled();
  });
});