import { afterEach, describe, expect, it, vi } from 'vitest';

import { startUiTransition } from '../../src/ui/startUiTransition.js';

const originalMatchMedia = window.matchMedia;
const originalStartViewTransition = document.startViewTransition;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  if (originalStartViewTransition) document.startViewTransition = originalStartViewTransition;
  else delete document.startViewTransition;
});

function setReducedMotion(matches) {
  window.matchMedia = vi.fn().mockReturnValue({ matches });
}

describe('startUiTransition', () => {
  it('View Transition API를 지원하지 않으면 갱신을 즉시 한 번 실행한다', () => {
    delete document.startViewTransition;
    setReducedMotion(false);
    const update = vi.fn();

    const transition = startUiTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
    expect(transition).toBeNull();
  });

  it('모션 감소 설정에서는 View Transition을 사용하지 않는다', () => {
    const startViewTransition = vi.fn();
    document.startViewTransition = startViewTransition;
    setReducedMotion(true);
    const update = vi.fn();

    const transition = startUiTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(transition).toBeNull();
  });

  it('지원 환경에서는 상태 갱신을 View Transition에 전달한다', () => {
    const result = { finished: Promise.resolve() };
    document.startViewTransition = vi.fn().mockReturnValue(result);
    setReducedMotion(false);
    const update = vi.fn();

    const transition = startUiTransition(update);

    expect(document.startViewTransition).toHaveBeenCalledWith(update);
    expect(update).not.toHaveBeenCalled();
    expect(transition).toBe(result);
  });
});
