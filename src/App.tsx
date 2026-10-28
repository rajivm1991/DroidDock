import { useEffect, useRef, useState } from "react";
import {
  loadThumbnailsEnabled,
  PHONE_GLYPH_ICON_KEY,
  PHONE_THUMB_ICON_KEY,
  saveThumbnailsEnabled,
  useIconSizeLimit,
  usePaneIconSize,
} from "./lib/iconSize";
import "./App.css";
import { type MacPaneHandle } from "./components/explorer/MacPane";
import { AdbSetupScreen } from "./components/setup/AdbSetupScreen";
import { AsIsNotice } from "./components/setup/AsIsNotice";
import { isAsIsAccepted } from "./lib/asIsAgreement";
import {
  FOLDER_OPEN_CLICK_KEY,
  loadFolderOpenClick,
  type FolderOpenClick,
} from "./lib/presets";
import { AppChrome } from "./components/shell/AppChrome";
import { AppOverlays } from "./components/shell/AppOverlays";
import { DualPane } from "./components/shell/DualPane";
import { useAdbDevices } from "./hooks/device/useAdbDevices";
import { useCopyPipeline } from "./hooks/shell/useCopyPipeline";
import { useBrowsePanes } from "./hooks/shell/useBrowsePanes";
import { useBannerMessages } from "./hooks/shell/useBannerMessages";
import { useThemeMode } from "./hooks/shell/useThemeMode";
import { useTutorialTour } from "./hooks/shell/useTutorialTour";
import { useTransferJob } from "./hooks/transfer/useTransferJob";
import { useTransferPrompts } from "./hooks/transfer/useTransferPrompts";

/**
 * Top-level shell. Device setup, appearance, and the shared path / focus
 * kernel stay here. Phone and Mac browsing is useBrowsePanes. Copy, sync,
 * shortcuts, and place marks are useCopyPipeline, called second so those
 * hooks keep their order. DualPane and AppOverlays only render.
 *
 * The Finder-drop folder name is produced in the copy pipeline, after phone
 * actions exist, and stored on a ref the earlier prompt hook reads when a
 * drop actually happens. That keeps the prompt hook where it was.
 */
function App() {
  const [currentPath, setCurrentPath] = useState<string>("/storage/emulated/0");
  const [detectedStoragePath, setDetectedStoragePath] = useState<string>("/storage/emulated/0");
  /** Bumps after folder delete so place marks re-check existence. */
  const [placeRefreshTick, setPlaceRefreshTick] = useState(0);
  const {
    error,
    setError,
    successMessage,
    setSuccessMessage,
  } = useBannerMessages();

  const {
    adbAvailable,
    devices,
    selectedDevice,
    setSelectedDevice,
    adbPath,
    checkAdb,
    loadDevices,
  } = useAdbDevices({
    setError,
  });

  const [showHiddenFiles, setShowHiddenFiles] = useState<boolean>(false);
  /**
   * Show Thumbnails stays as the person left it, including after a restart.
   * The Icons size that goes with it is kept in usePaneIconSize.
   */
  const [thumbnailsEnabled, setThumbnailsEnabled] = useState<boolean>(loadThumbnailsEnabled);
  /**
   * Some people expect Finder-style double-click; others want one click into
   * folders. The default stays double-click. Cmd/Shift/Ctrl never opens.
   */
  const [folderOpenClick, setFolderOpenClick] = useState<FolderOpenClick>(() =>
    loadFolderOpenClick(),
  );
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  /**
   * A native phone select drew macOS menus over the chrome. This is a custom
   * menu. The saved-sync select in the sync dialog is separate.
   */
  const [phoneMenuOpen, setPhoneMenuOpen] = useState(false);
  const phonePickerRef = useRef<HTMLDivElement>(null);
  const theme = useThemeMode();
  const job = useTransferJob();

  /**
   * Cmd+A selects on the pane that was focused last and clears the other
   * pane. Copy still follows whichever pane has a selection.
   */
  const [activePane, setActivePane] = useState<"phone" | "mac">("phone");
  const macPaneHandleRef = useRef<MacPaneHandle | null>(null);
  const phoneDestinationLabelRef = useRef<() => string>(() => "phone");
  const prompts = useTransferPrompts({
    setError,
    transferJobRef: job.transferJobRef,
    phoneDestinationLabel: () => phoneDestinationLabelRef.current(),
  });

  const phonePaneRef = useRef<HTMLDivElement | null>(null);
  const macPaneRef = useRef<HTMLElement | null>(null);

  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'column'>(() => {
    const saved = localStorage.getItem('droiddock-view-mode');
    return (saved === 'table' || saved === 'grid' || saved === 'column') ? saved : 'table';
  });
  const [showShortcutsHelp, setShowShortcutsHelp] = useState<boolean>(false);
  /**
   * As-is acceptance is required before setup or the library, including when
   * adb is already installed and setup would be skipped. The tour waits until
   * this is true so it does not open underneath the notice.
   */
  const [asIsAccepted, setAsIsAcceptedState] = useState(() => isAsIsAccepted());
  /**
   * Photo sizes are only drawn while thumbnails are on and the pane can show
   * them. The saved thumbnail size is left alone, so the next time previews
   * are on — including the next launch — that size comes back.
   */
  const iconSizeMax = useIconSizeLimit(
    thumbnailsEnabled,
    asIsAccepted && adbAvailable === true,
  );
  const { iconSize: shownIconSize, setIconSize } = usePaneIconSize(
    PHONE_THUMB_ICON_KEY,
    PHONE_GLYPH_ICON_KEY,
    thumbnailsEnabled,
    iconSizeMax,
  );
  useEffect(() => {
    saveThumbnailsEnabled(thumbnailsEnabled);
  }, [thumbnailsEnabled]);
  const tutorial = useTutorialTour({
    adbAvailable,
    asIsAccepted,
    setViewMode,
    viewMode,
  });

  /**
   * Close the custom phone menu on outside click or Escape so it does not
   * stick open over the panes.
   */
  useEffect(() => {
    if (!phoneMenuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!phonePickerRef.current?.contains(event.target as Node)) {
        setPhoneMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhoneMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [phoneMenuOpen]);

  useEffect(() => {
    localStorage.setItem('droiddock-view-mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(FOLDER_OPEN_CLICK_KEY, folderOpenClick);
  }, [folderOpenClick]);

  const browse = useBrowsePanes({
    selectedDevice,
    currentPath,
    setCurrentPath,
    detectedStoragePath,
    setError,
    setSuccessMessage,
    showHiddenFiles,
    thumbnailsEnabled,
    folderOpenClick,
    viewMode,
    setActivePane,
    macPaneHandleRef,
    phonePaneRef,
    setPlaceRefreshTick,
    transferFlowBusyRef: prompts.transferFlowBusyRef,
    conflictPromptResolver: prompts.conflictPromptResolver,
  });

  const copy = useCopyPipeline({
    browse,
    job,
    prompts,
    selectedDevice,
    currentPath,
    setCurrentPath,
    detectedStoragePath,
    setDetectedStoragePath,
    setError,
    setSuccessMessage,
    showHiddenFiles,
    setShowHiddenFiles,
    thumbnailsEnabled,
    setThumbnailsEnabled,
    settingsOpen,
    setSettingsOpen,
    activePane,
    setActivePane,
    viewMode,
    setViewMode,
    iconSize: shownIconSize,
    iconSizeMax,
    setIconSize,
    showShortcutsHelp,
    setShowShortcutsHelp,
    tutorialOpen: tutorial.tutorialOpen,
    closeTutorial: tutorial.closeTutorial,
    phonePaneRef,
    macPaneRef,
    macPaneHandleRef,
    phoneDestinationLabelRef,
    placeRefreshTick,
    setPlaceRefreshTick,
  });

  if (!asIsAccepted) {
    return (
      <div className="container">
        <AsIsNotice onAccept={() => setAsIsAcceptedState(true)} />
      </div>
    );
  }

  if (adbAvailable === false) {
    return (
      <div className="container">
        <AdbSetupScreen
          triedPath={adbPath}
          onReady={() => {
            void checkAdb();
          }}
        />
      </div>
    );
  }

  const connectedDevice = devices.find((device) => device.id === selectedDevice);

  return (
    <div
      className="container"
      onDragOver={copy.handleDragOver}
      onDragLeave={copy.handleDragLeave}
      onDrop={copy.handleDrop}
    >
      {/*
        Device pick, Sync, and Settings are app-wide. Each pane’s path row has
        Back, Forward, and Refresh. Mac stays open. Copy uses the selection
        strip, the context menu, or a drag into the open folder on the other pane.
      */}
      <DualPane
        chrome={
          <AppChrome
            devices={devices}
            selectedDevice={selectedDevice}
            setSelectedDevice={setSelectedDevice}
            setSettingsOpen={setSettingsOpen}
            settingsOpen={settingsOpen}
            phoneMenuOpen={phoneMenuOpen}
            setPhoneMenuOpen={setPhoneMenuOpen}
            phonePickerRef={phonePickerRef}
            loadDevices={loadDevices}
            handleOpenSyncDialog={copy.handleOpenSyncDialog}
            connectedDevice={connectedDevice}
          />
        }
        browse={browse}
        copy={copy}
        job={job}
        prompts={prompts}
        selectedDevice={selectedDevice}
        currentPath={currentPath}
        setCurrentPath={setCurrentPath}
        setError={setError}
        showHiddenFiles={showHiddenFiles}
        thumbnailsEnabled={thumbnailsEnabled}
        folderOpenClick={folderOpenClick}
        viewMode={viewMode}
        setViewMode={setViewMode}
        iconSize={shownIconSize}
        iconSizeMax={iconSizeMax}
        setIconSize={setIconSize}
        activePane={activePane}
        phonePaneRef={phonePaneRef}
        macPaneRef={macPaneRef}
        macPaneHandleRef={macPaneHandleRef}
        loadDevices={loadDevices}
        error={error}
        successMessage={successMessage}
        setSuccessMessage={setSuccessMessage}
      />
      <AppOverlays
        browse={browse}
        copy={copy}
        job={job}
        prompts={prompts}
        theme={theme}
        tutorial={tutorial}
        selectedDevice={selectedDevice}
        currentPath={currentPath}
        showHiddenFiles={showHiddenFiles}
        setShowHiddenFiles={setShowHiddenFiles}
        thumbnailsEnabled={thumbnailsEnabled}
        setThumbnailsEnabled={setThumbnailsEnabled}
        folderOpenClick={folderOpenClick}
        setFolderOpenClick={setFolderOpenClick}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        showShortcutsHelp={showShortcutsHelp}
        setShowShortcutsHelp={setShowShortcutsHelp}
      />
    </div>
  );
}

export default App;
