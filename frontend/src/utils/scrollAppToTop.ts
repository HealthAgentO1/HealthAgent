/**
 * App content scrolls inside `Layout`'s `<main>`; reset both so a full page view starts at the top.
 */
export function scrollAppToTop(): void {
  const run = () => {
    document.querySelector("main")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };
  run();
  requestAnimationFrame(run);
}
