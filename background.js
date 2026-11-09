// Comparison experiment: invoke the action directly rather than letting Chrome
// open the panel automatically. No additional tab or host permissions are used.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => {
  console.error('사이드 패널 동작 설정에 실패했습니다.', error);
});

chrome.action.onClicked.addListener((tab) => {
  // Keep this diagnostic limited to event stages; never log tab or page data.
  console.info('[panel-diagnostic] action-click');
  try {
    // Call immediately inside the gesture; awaiting another operation can lose it.
    console.info('[panel-diagnostic] open-call');
    chrome.sidePanel.open({ windowId: tab.windowId }).then(
      () => console.info('[panel-diagnostic] open-resolved'),
      () => console.error('[panel-diagnostic] open-rejected')
    );
  } catch {
    console.error('[panel-diagnostic] open-threw');
  }
});
