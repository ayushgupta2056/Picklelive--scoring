// Applied before first paint (no inline script, so the CSP stays strict). Dark is the default.
try {
  var t = localStorage.getItem("pl-theme");
  if (t === "light") document.documentElement.classList.remove("dark");
} catch (e) {}
