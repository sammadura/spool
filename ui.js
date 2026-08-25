(function (g) {
  "use strict";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function pct(x) { return Math.round(x * 100) + ""; }

  function card(voice, index, bus) {
    var art = el("article", "spool");
    art.dataset.i = String(index);
    art.dataset.speed = "mid";

    var lamp = el("div", "lamp-dot");
    art.appendChild(lamp);

    var plate = el("div", "plate");
    plate.appendChild(el("h2", "", voice.label));
    var tag = el("span", "tag", "spool " + (index + 1));
    plate.appendChild(tag);
    art.appendChild(plate);

    var reels = el("button", "reels");
    reels.type = "button";
    reels.setAttribute("aria-label", "splice a new loop onto " + voice.label);
    reels.appendChild(el("div", "reel left"));
    reels.appendChild(el("div", "reel right"));
    art.appendChild(reels);

    var chips = el("div", "chips");
    var mute = el("button", "chip", "mute");
    mute.type = "button";
    mute.setAttribute("aria-pressed", "false");
    var solo = el("button", "chip", "solo");
    solo.type = "button";
    solo.setAttribute("aria-pressed", "false");
    chips.appendChild(mute);
    chips.appendChild(solo);
    art.appendChild(chips);

    var dials = el("div", "dials");
    var keys = [
      ["grit", 0.22],
      ["slack", 0.28],
      ["heat", 0.55],
      ["speed", 1]
    ];
    var inputs = {};
    keys.forEach(function (pair) {
      var key = pair[0];
      var init = pair[1];
      var lab = el("label", "dial");
      lab.appendChild(el("span", "", key));
      var inp = el("input");
      inp.type = "range";
      inp.min = key === "speed" ? "0.5" : "0";
      inp.max = key === "speed" ? "1.6" : "1";
      inp.step = "0.01";
      inp.value = String(init);
      inp.setAttribute("aria-label", voice.label + " " + key);
      var val = el("span", "v", key === "speed" ? init.toFixed(2) : pct(init));
      lab.appendChild(inp);
      lab.appendChild(val);
      dials.appendChild(lab);
      inputs[key] = { inp: inp, val: val };
    });
    art.appendChild(dials);

    function spinState(on) {
      art.classList.toggle("live", on);
      art.querySelectorAll(".reel").forEach(function (r) {
        r.classList.toggle("spin", on);
      });
    }

    function speedBand(s) {
      art.dataset.speed = s < 0.8 ? "slow" : s > 1.2 ? "fast" : "mid";
    }

    mute.addEventListener("click", function () {
      var on = mute.getAttribute("aria-pressed") !== "true";
      mute.setAttribute("aria-pressed", on ? "true" : "false");
      mute.classList.toggle("on", on);
      art.classList.toggle("muted", on);
      bus.mute(index, on);
    });

    solo.addEventListener("click", function () {
      var on = solo.getAttribute("aria-pressed") !== "true";
      solo.setAttribute("aria-pressed", on ? "true" : "false");
      solo.classList.toggle("on", on);
      art.classList.toggle("soloed", on);
      bus.solo(index, on);
    });

    Object.keys(inputs).forEach(function (key) {
      inputs[key].inp.addEventListener("input", function () {
        var n = parseFloat(inputs[key].inp.value);
        if (key === "speed") {
          inputs[key].val.textContent = n.toFixed(2);
          speedBand(n);
        } else {
          inputs[key].val.textContent = pct(n);
        }
        bus.set(index, key, n);
      });
    });

    reels.addEventListener("click", function () {
      art.classList.add("live");
      bus.splice(index);
    });

    return {
      root: art,
      spin: spinState,
      speedBand: speedBand
    };
  }

  function mount(deck, voices, bus) {
    var cards = voices.map(function (v, i) {
      var c = card(v, i, bus);
      deck.appendChild(c.root);
      return c;
    });
    return cards;
  }

  g.SpoolUI = { mount: mount };
})(window);
