(function () {
  // Kind, kid-friendly ideas. Keep every message free of insults and bad words (tests/build.cjs checks this list).
  const ideas = [
    "Time to do your homework!",
    "Open a book and read a chapter.",
    "Practise your spelling words.",
    "Try some maths puzzles.",
    "Go outside and play!",
    "Draw a picture of your favourite animal.",
    "Build something with blocks or Lego.",
    "Help someone at home with a job.",
    "Learn three new words today.",
    "Write a short story.",
    "Practise an instrument.",
    "Ride your bike or go for a walk.",
    "Do some stretches and jumping jacks.",
    "Tidy your desk so studying is easier.",
    "Ask a grown-up to play a board game.",
    "Water the plants.",
    "Look at the clouds. What shapes can you see?",
    "Your brain is ready to learn something new!",
  ];

  async function showLimit() {
    const { dailyLimitMinutes } = await ext.storage.local.get("dailyLimitMinutes");
    document.getElementById("limit-message").textContent =
      `You have watched YouTube for ${describeMinutes(getLimitMinutes(dailyLimitMinutes))} today. That’s enough for now. ` +
      "It’s time to study! YouTube will be back tomorrow.";
  }
  showLimit().catch(console.error);
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.dailyLimitMinutes) showLimit().catch(console.error);
  });

  const el = document.getElementById("idea");
  let last = -1;
  function showIdea() {
    let next = Math.floor(Math.random() * ideas.length);
    if (next === last) next = (next + 1) % ideas.length;
    last = next;
    el.textContent = ideas[next];
  }
  showIdea();
  // Slow enough for a young reader to finish each idea.
  setInterval(showIdea, 5000);

  // window.close() is refused for tabs that have history, which is always the
  // case after a redirect, so close the tab through the tabs API instead.
  async function closeTab() {
    try {
      const tab = await ext.tabs.getCurrent();
      if (tab) {
        await ext.tabs.remove(tab.id);
        return;
      }
    } catch (error) {
      console.error("[Enough YouTube] Could not close the tab:", error);
    }
    window.close();
  }
  document.getElementById("close").addEventListener("click", () => { closeTab(); });
})();
