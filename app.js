(function () {
  "use strict";

  var engine = new SpoolAudio.Engine();
  var cards = [];
  var winding = false;

  var bus = {
    set: function (i, key, val) { engine.set(i, key, val); },
    mute: function (i, on) { engine.voices[i].setMute(on); },
    solo: function (i, on) { engine.voices[i].setSolo(on); },
    splice: function (i) {
      var art = cards[i] && cards[i].root;
      if (art) art.classList.add("busy");
      engine.voices[i].splice().then(function () {
        if (art) art.classList.remove("busy");
      });
    }
  };

  var deck = document.getElementById("deck");
  cards = SpoolUI.mount(deck, SpoolAudio.VOICES, bus);

  var gate = document.getElementById("gate");
  var shop = document.getElementById("shop");
  var wind = document.getElementById("wind");
  var still = document.getElementById("still");

  function go() {
    if (winding) return;
    winding = true;
    wind.textContent = "Winding…";
    wind.disabled = true;
    engine.wind().then(function () {
      shop.hidden = false;
      cards.forEach(function (c) { c.spin(true); });
      gate.classList.add("out");
      setTimeout(function () { gate.hidden = true; }, 520);
    }).catch(function () {
      winding = false;
      wind.disabled = false;
      wind.textContent = "Wind";
    });
  }

  wind.addEventListener("click", go);
  wind.addEventListener("touchstart", function () {}, { passive: true });

  still.addEventListener("click", function () {
    var on = still.getAttribute("aria-pressed") !== "true";
    still.setAttribute("aria-pressed", on ? "true" : "false");
    still.textContent = on ? "Wind" : "Still";
    engine.still(on);
    cards.forEach(function (c) { c.spin(!on); });
  });

  document.addEventListener("visibilitychange", function () {
    if (!engine.ctx) return;
    if (document.hidden) engine.ctx.suspend();
    else if (engine.running) engine.ctx.resume();
  });
})();
