// background.js
// idk if i even need this file but the tutorial said to make one

chrome.runtime.onInstalled.addListener(() => {
  // this runs when the extension is installed i think
  console.log("extension installed!!");
  // TODO: maybe show a welcome page?? ask on stackoverflow
});

// i tried putting the tab search logic here but it didnt work
// so i moved everything to popup.js
