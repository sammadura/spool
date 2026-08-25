(function (g) {
  "use strict";

  var VOICES = [
    { id: "oak",  label: "Oak",  freqs: [49, 73.4, 98, 146.8], waves: ["sine", "triangle"], dur: 2.72, hum: 49, amp: 0.30, noise: 0.045, note: 0.95 },
    { id: "tin",  label: "Tin",  freqs: [196, 246.9, 293.7, 329.6], waves: ["triangle", "sine"], dur: 2.08, hum: 98, amp: 0.17, noise: 0.09, note: 0.42 },
    { id: "bone", label: "Bone", freqs: [392, 440, 523.3, 587.3], waves: ["sine"], dur: 3.36, hum: 196, amp: 0.11, noise: 0.15, note: 0.72 },
    { id: "wax",  label: "Wax",  freqs: [82.4, 110, 164.8, 220], waves: ["triangle", "sine"], dur: 1.64, hum: 41.2, amp: 0.20, noise: 0.07, note: 0.16 }
  ];

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function curve(amt) {
    var n = 2048, c = new Float32Array(n);
    var k = 1 + amt * 18;
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      c[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    return c;
  }

  function liveNoise(ctx) {
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  function renderLoop(voice, seed, sr) {
    var rng = mulberry(seed);
    var frames = Math.max(1, Math.floor(voice.dur * sr));
    var off = new OfflineAudioContext(1, frames, sr);
    var dest = off.destination;
    var len = voice.dur;

    var hum = off.createOscillator();
    hum.type = "sine";
    hum.frequency.value = voice.hum;
    var hg = off.createGain();
    hg.gain.value = 0.035;
    hum.connect(hg).connect(dest);
    hum.start(0);
    hum.stop(len);

    var events = 4 + (rng() * 5 | 0);
    for (var e = 0; e < events; e++) {
      var osc = off.createOscillator();
      osc.type = voice.waves[(rng() * voice.waves.length) | 0];
      var f = voice.freqs[(rng() * voice.freqs.length) | 0];
      if (rng() < 0.18) f *= 0.5;
      osc.frequency.value = f;
      var filt = off.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 380 + rng() * 2600;
      filt.Q.value = 0.4 + rng() * 1.2;
      var gn = off.createGain();
      var at = rng() * Math.max(0.05, len - 0.25);
      var dur = 0.08 + rng() * voice.note;
      var peak = voice.amp * (0.35 + rng() * 0.65);
      gn.gain.setValueAtTime(0.0001, at);
      gn.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + 0.018);
      gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(filt).connect(gn).connect(dest);
      osc.start(at);
      osc.stop(Math.min(len, at + dur + 0.03));
    }

    var nb = off.createBuffer(1, frames, sr);
    var nd = nb.getChannelData(0);
    var acc = 0;
    for (var i = 0; i < frames; i++) {
      acc = acc * 0.97 + (rng() * 2 - 1) * 0.03;
      nd[i] = acc + (rng() * 2 - 1) * 0.08;
    }
    var ns = off.createBufferSource();
    ns.buffer = nb;
    var nf = off.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 1800 + rng() * 2200;
    nf.Q.value = 0.6;
    var ng = off.createGain();
    ng.gain.value = voice.noise;
    ns.connect(nf).connect(ng).connect(dest);
    ns.start(0);

    return off.startRendering();
  }

  function Voice(engine, index) {
    this.engine = engine;
    this.index = index;
    this.meta = VOICES[index];
    this.seed = 101 + index * 97;
    this.muted = false;
    this.solo = false;
    this.speed = 1;
    this.grit = 0.22;
    this.slack = 0.28;
    this.heat = 0.55;
    this.src = null;
    this.buf = null;
    this._build();
  }

  Voice.prototype._build = function () {
    var ctx = this.engine.ctx;
    this.pre = ctx.createGain();
    this.pre.gain.value = 0.55;
    this.shape = ctx.createWaveShaper();
    this.shape.curve = curve(this.grit);
    this.shape.oversample = "2x";
    this.heatF = ctx.createBiquadFilter();
    this.heatF.type = "lowpass";
    this.heatF.Q.value = 0.65;
    this.delay = ctx.createDelay(0.09);
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.11 + this.index * 0.037;
    this.lfoG = ctx.createGain();
    this.lfo.connect(this.lfoG);
    this.lfoG.connect(this.delay.delayTime);
    this.lfo.start();
    this.hissG = ctx.createGain();
    this.mix = ctx.createGain();
    this.muteG = ctx.createGain();
    this.muteG.gain.value = 1;

    this.pre.connect(this.shape);
    this.shape.connect(this.heatF);
    this.heatF.connect(this.delay);
    this.heatF.connect(this.mix);
    this.delay.connect(this.mix);
    this.hissG.connect(this.mix);
    this.mix.connect(this.muteG);
    this.muteG.connect(this.engine.bus);

    this.engine.hiss.connect(this.hissG);
    this.apply();
  };

  Voice.prototype.apply = function () {
    this.shape.curve = curve(this.grit);
    this.hissG.gain.value = 0.01 + this.grit * 0.07;
    this.pre.gain.value = 0.42 + this.grit * 0.55;
    var hz = 420 + this.heat * 6200;
    this.heatF.frequency.setTargetAtTime(hz, this.engine.ctx.currentTime, 0.04);
    this.lfoG.gain.value = 0.001 + this.slack * 0.028;
    this.delay.delayTime.value = 0.006 + this.slack * 0.03;
    if (this.src) this.src.playbackRate.value = this.speed;
  };

  Voice.prototype.setMute = function (on) {
    this.muted = on;
    this.engine.refreshMutes();
  };

  Voice.prototype.setSolo = function (on) {
    this.solo = on;
    this.engine.refreshMutes();
  };

  Voice.prototype.refreshGain = function (anySolo) {
    var hear = this.muted ? false : (anySolo ? this.solo : true);
    var v = hear ? 1 : 0;
    this.muteG.gain.setTargetAtTime(v, this.engine.ctx.currentTime, 0.03);
  };

  Voice.prototype.attach = function (buf, fade) {
    var ctx = this.engine.ctx;
    var now = ctx.currentTime;
    if (this.src) {
      try {
        this.src.gainNode.gain.setTargetAtTime(0, now, 0.03);
        this.src.stop(now + 0.18);
      } catch (e) {}
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = this.speed;
    var gn = ctx.createGain();
    gn.gain.value = 0.0001;
    src.connect(gn).connect(this.pre);
    src.gainNode = gn;
    src.start();
    gn.gain.setTargetAtTime(0.95, now, fade ? 0.05 : 0.02);
    this.src = src;
    this.buf = buf;
  };

  Voice.prototype.splice = function () {
    var self = this;
    this.seed = (this.seed * 1103515245 + 12345 + (Math.random() * 1e6 | 0)) >>> 0;
    return renderLoop(this.meta, this.seed, this.engine.ctx.sampleRate).then(function (buf) {
      self.attach(buf, true);
      return buf;
    });
  };

  function Engine() {
    this.ctx = null;
    this.bus = null;
    this.master = null;
    this.hiss = null;
    this.voices = [];
    this.running = false;
  }

  Engine.prototype.boot = function () {
    if (this.ctx) return Promise.resolve();
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.72;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.18;
    this.bus = ctx.createGain();
    this.bus.connect(comp);
    comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.hiss = liveNoise(ctx);
    var hf = ctx.createBiquadFilter();
    hf.type = "highpass";
    hf.frequency.value = 1400;
    var room = ctx.createGain();
    room.gain.value = 0.018;
    this.hiss.connect(hf).connect(room).connect(this.master);

    var motor = ctx.createOscillator();
    motor.type = "sine";
    motor.frequency.value = 58.5;
    var mg = ctx.createGain();
    mg.gain.value = 0.012;
    motor.connect(mg).connect(this.master);
    motor.start();

    for (var i = 0; i < 4; i++) this.voices.push(new Voice(this, i));
    return Promise.resolve();
  };

  Engine.prototype.refreshMutes = function () {
    var any = this.voices.some(function (v) { return v.solo; });
    this.voices.forEach(function (v) { v.refreshGain(any); });
  };

  Engine.prototype.wind = function () {
    var self = this;
    return this.boot().then(function () {
      return self.ctx.resume();
    }).then(function () {
      var jobs = self.voices.map(function (v, i) {
        return renderLoop(v.meta, v.seed, self.ctx.sampleRate).then(function (buf) {
          v.attach(buf, false);
        });
      });
      return Promise.all(jobs);
    }).then(function () {
      self.running = true;
      self.master.gain.setTargetAtTime(0.72, self.ctx.currentTime, 0.05);
    });
  };

  Engine.prototype.still = function (on) {
    if (!this.ctx) return;
    this.running = !on;
    this.master.gain.setTargetAtTime(on ? 0 : 0.72, this.ctx.currentTime, 0.06);
    if (!on) this.ctx.resume();
    else if (this.ctx.state === "running") {
      /* keep context; just fade */
    }
  };

  Engine.prototype.set = function (i, key, val) {
    var v = this.voices[i];
    if (!v) return;
    v[key] = val;
    v.apply();
  };

  g.SpoolAudio = {
    Engine: Engine,
    VOICES: VOICES
  };
})(window);
