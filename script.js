(() => {
  'use strict';

  document.documentElement.classList.add('js');
  const header = document.querySelector('.site-header');
  const navToggle = document.querySelector('[data-nav-toggle]');
  const navLinks = document.querySelector('[data-nav-links]');
  const sectionLinks = [...document.querySelectorAll('[data-section]')];
  const closeMenu = () => {
    navLinks.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  };
  navToggle.hidden = false;
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  sectionLinks.forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && navLinks.classList.contains('is-open')) {
      closeMenu();
      navToggle.focus();
    }
  });

  const groups = [...document.querySelectorAll('[data-tracking-group], [data-entry-preview]')];
  const previews = [...document.querySelectorAll('[data-preview-src]')];
  const focusGroups = [...document.querySelectorAll('[data-focus-group]')];
  const lightbox = document.querySelector('#simulation-video-lightbox');
  const simulationOverview = document.querySelector('[data-simulation-overview]');
  const player = lightbox.querySelector('.lightbox-player');
  const title = lightbox.querySelector('#simulation-video-lightbox-title');
  const lightboxContext = lightbox.querySelector('[data-lightbox-context]');
  const realMontage = document.querySelector('[data-real-montage]');
  const hoverVideo = document.querySelector('[data-real-hover]');
  const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const panelLightbox = document.querySelector('#kmppi-panel-lightbox');
  const demoFrame = document.querySelector('[data-demo-player]');
  const demoVideo = demoFrame.querySelector('video');
  const demoSurface = demoFrame.querySelector('[data-demo-surface]');
  const demoError = demoFrame.querySelector('[data-demo-error]');
  let demoExpanded = false;
  const directLink = lightbox.querySelector('.lightbox-direct');
  const errorMessage = lightbox.querySelector('.lightbox-error');
  const previewToggles = [...document.querySelectorAll('[data-preview-toggle]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrowScreen = window.matchMedia('(max-width: 920px)');
  const connection = navigator.connection;
  const positions = new WeakMap();
  const visibleGroups = new Map();
  const userPaused = new WeakMap();
  let lastTrigger = null;
  const dialogIsOpen = () => lightbox.open || panelLightbox.open;
  const syncModalLock = () => {
    document.documentElement.classList.toggle('modal-open', dialogIsOpen() || demoExpanded);
    if (dialogIsOpen() || demoExpanded) focusGroups.forEach(clearMediaFocus);
  };
  let enteredFullscreen = false;
  let closing = false;
  let hoverTarget = null;
  let hoverTimer = null;
  const clearMediaFocus = group => {
    group.classList.remove('has-focus');
    group.querySelectorAll('.is-focus').forEach(item => item.classList.remove('is-focus'));
  };
  const focusMediaItem = item => {
    if (!hoverPointer.matches || reducedMotion.matches || dialogIsOpen() || demoExpanded) return;
    if (item.classList.contains('is-focus')) return;
    const group = item.closest('[data-focus-group]');
    clearMediaFocus(group);
    const bounds = group.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    const x = (rect.left + rect.width / 2 - bounds.left) / bounds.width;
    const y = (rect.top + rect.height / 2 - bounds.top) / bounds.height;
    const horizontal = x < .4 ? 'left' : x > .6 ? 'right' : 'center';
    const vertical = rect.height > bounds.height * .65 || y < .4 ? 'top' : y > .6 ? 'bottom' : 'center';
    item.style.setProperty('--focus-origin', `${horizontal} ${vertical}`);
    item.classList.add('is-focus');
    group.classList.add('has-focus');
  };
  focusGroups.forEach(group => {
    group.querySelectorAll('[data-focus-item]:not([data-real-tile])').forEach(item => {
      const release = () => {
        if (item.classList.contains('is-focus') && !item.matches(':hover') &&
            !item.matches(':focus-visible') && !item.querySelector(':focus-visible')) clearMediaFocus(group);
      };
      item.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen') focusMediaItem(item);
      });
      item.addEventListener('pointerleave', release);
      item.addEventListener('focusin', event => {
        if (event.target.matches(':focus-visible')) focusMediaItem(item);
      });
      item.addEventListener('focusout', () => queueMicrotask(release));
    });
  });
  const resetMediaFocus = () => focusGroups.forEach(clearMediaFocus);
  window.addEventListener('resize', resetMediaFocus);
  hoverPointer.addEventListener('change', resetMediaFocus);
  reducedMotion.addEventListener('change', resetMediaFocus);
  const stopRealHover = () => {
    window.clearTimeout(hoverTimer);
    hoverTarget?.classList.remove('is-previewing');
    hoverTarget = null;
    clearMediaFocus(realMontage.querySelector('[data-focus-group]'));
    hoverVideo.hidden = true;
    if (hoverVideo.hasAttribute('src')) {
      hoverVideo.pause();
      hoverVideo.removeAttribute('src');
      hoverVideo.load();
    }
  };

  const previewsPaused = group => userPaused.get(group) ?? (reducedMotion.matches || Boolean(connection?.saveData));
  const syncPreviewControl = group => {
    const toggle = group.querySelector('[data-preview-toggle]');
    if (!toggle) return;
    const paused = previewsPaused(group);
    const label = `${paused ? 'Play' : 'Pause'} ${toggle.dataset.previewLabel}`;
    toggle.classList.toggle('is-paused', paused);
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.querySelector('[data-preview-icon]').setAttribute('src', paused ? 'assets/icons/play.svg' : 'assets/icons/pause.svg');
    if (group === demoFrame) {
      demoSurface.classList.toggle('is-paused', paused);
      demoSurface.setAttribute('aria-label', label);
      demoSurface.querySelector('img').src = paused ? 'assets/icons/play.svg' : 'assets/icons/pause.svg';
    }
  };
  const stopPreview = video => {
    video.classList.remove('has-frame');
    if (!video.hasAttribute('src')) return;
    positions.set(video, { src: video.getAttribute('src'), time: video.currentTime });
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
  previews.forEach(video => {
    const group = video.closest('[data-tracking-group], [data-entry-preview]');
    video.addEventListener('loadeddata', () => video.classList.add('has-frame'));
    video.addEventListener('playing', () => {
      if (previewsPaused(group) || group.closest('[hidden]') || document.hidden || dialogIsOpen()) {
        video.pause();
        return;
      }
      video.classList.add('has-frame');
    });
    video.addEventListener('emptied', () => video.classList.remove('has-frame'));
    video.addEventListener('error', () => {
      video.classList.remove('has-frame');
      userPaused.set(group, true);
      updatePreviews();
    });
    video.addEventListener('loadedmetadata', () => {
      const saved = positions.get(video);
      const time = saved?.src === video.getAttribute('src') ? saved.time : 0;
      if (time > 0 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(time, Math.max(0, video.duration - 0.1));
      }
    });
  });
  demoVideo.addEventListener('loadeddata', () => { demoError.hidden = true; });
  demoVideo.addEventListener('error', () => { demoError.hidden = false; });

  const updatePreviews = () => {
    if (hoverTarget && (document.hidden || dialogIsOpen() || closing || demoExpanded ||
        !visibleGroups.get(realMontage) || previewsPaused(realMontage) ||
        reducedMotion.matches || connection?.saveData || !hoverPointer.matches)) stopRealHover();
    groups.forEach(syncPreviewControl);
    const comparisonInView = [...visibleGroups.entries()].some(([group, ratio]) =>
      group.hasAttribute('data-simulation-comparison') && ratio > .5 && !group.closest('[hidden]') && !previewsPaused(group));
    const candidates = document.hidden || dialogIsOpen() || closing ? [] :
      (demoExpanded ? [[demoFrame, 1]] : [...visibleGroups.entries()])
        .filter(([group, ratio]) => ratio > 0 && !group.closest('[hidden]') && !previewsPaused(group) &&
          !(group === simulationOverview && comparisonInView))
        .sort((a, b) => {
          const distance = group => Math.abs(group.getBoundingClientRect().top +
            group.getBoundingClientRect().height / 2 - window.innerHeight / 2);
          return distance(a[0]) - distance(b[0]);
        })
        .map(([group]) => group);
    const active = [];
    let videoCount = hoverVideo.hasAttribute('src') ? 1 : 0;
    const maxVideos = narrowScreen.matches ? 2 : 4;
    // Independent comparison players share the existing decoder budget.
    for (const group of candidates) {
      if (videoCount >= maxVideos) break;
      const count = group.querySelectorAll('[data-preview-src]').length;
      if (videoCount + count <= maxVideos) {
        active.push(group);
        videoCount += count;
      }
    }
    if (hoverTarget && !active.includes(realMontage)) stopRealHover();
    groups.forEach(group => {
      group.querySelectorAll('[data-preview-src]').forEach(video => {
        const source = (!narrowScreen.matches && video.dataset.previewDesktopSrc) || video.dataset.previewSrc;
        if (!active.includes(group)) {
          // Keep the displayed frame on manual pause; unload only when inactive/offscreen.
          if (previewsPaused(group) && (visibleGroups.get(group) > 0 || (group === demoFrame && demoExpanded)) &&
              !document.hidden && !dialogIsOpen() && !closing && (!demoExpanded || group === demoFrame) && video.getAttribute('src') === source) {
            video.pause();
          } else {
            stopPreview(video);
          }
          return;
        }
        if (video.getAttribute('src') !== source || video.error) {
          stopPreview(video);
          video.src = source;
          video.load();
        }
        if (video.paused) void video.play().catch(error => {
          if (error.name !== 'AbortError' && video.hasAttribute('src') && !previewsPaused(group)) {
            userPaused.set(group, true);
            updatePreviews();
          }
        });
      });
    });
  };

  const simulationSwitch = document.querySelector('[data-simulation-switch]');
  const simulationPanels = [...document.querySelectorAll('[data-simulation-panel]')];
  const selectSimulationRobot = robot => {
    const current = robot === 'go2' ? 'Unitree Go2' : 'Unitree G1';
    const next = robot === 'go2' ? 'Unitree G1' : 'Unitree Go2';
    simulationSwitch.dataset.selected = robot;
    simulationSwitch.setAttribute('aria-label', `${current} selected. Switch to ${next}`);
    simulationSwitch.title = `Switch to ${next}`;
    simulationPanels.forEach(panel => {
      panel.hidden = panel.id !== `simulation-panel-${robot}`;
      if (panel.hidden) {
        panel.querySelectorAll('[data-tracking-group]').forEach(group => visibleGroups.delete(group));
        panel.querySelectorAll('[data-preview-src]').forEach(stopPreview);
      }
    });
    updatePreviews();
  };
  simulationSwitch.hidden = false;
  simulationSwitch.addEventListener('click', () => {
    selectSimulationRobot(simulationSwitch.dataset.selected === 'go2' ? 'g1' : 'go2');
  });
  simulationSwitch.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    selectSimulationRobot(event.key === 'ArrowLeft' || event.key === 'Home' ? 'go2' : 'g1');
  });
  selectSimulationRobot('go2');

  if ('IntersectionObserver' in window) {
    const navigationVisibility = new Map();
    const sectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => navigationVisibility.set(entry.target.id, entry.isIntersecting));
      const current = sectionLinks.find(link => navigationVisibility.get(link.dataset.section));
      sectionLinks.forEach(link => {
        const active = link === current;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-20% 0px -55% 0px', threshold: 0 });
    sectionLinks.forEach(link => sectionObserver.observe(document.getElementById(link.dataset.section)));

    const videoObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => visibleGroups.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0));
      updatePreviews();
    }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
    groups.forEach(group => videoObserver.observe(group));
    previewToggles.forEach(toggle => { toggle.hidden = false; });
    demoFrame.querySelector('[data-demo-controls]').hidden = false;
    document.querySelectorAll('[data-comparison-controls]').forEach(controls => { controls.hidden = false; });
    demoSurface.hidden = false;
    demoFrame.querySelector('[data-demo-fallback]').hidden = true;
  }
  previewToggles.forEach(toggle => toggle.addEventListener('click', () => {
    const group = toggle.closest('[data-tracking-group], [data-entry-preview]');
    userPaused.set(group, !previewsPaused(group));
    updatePreviews();
  }));
  groups.forEach(syncPreviewControl);
  const queueRealHover = target => {
    stopRealHover();
    if (!hoverPointer.matches || reducedMotion.matches || connection?.saveData ||
        previewsPaused(realMontage) || dialogIsOpen() || document.hidden) return;
    hoverTarget = target;
    hoverTimer = window.setTimeout(() => {
      if (hoverTarget !== target || !visibleGroups.get(realMontage)) return;
      target.append(hoverVideo);
      const source = target.dataset.hoverSrc;
      hoverVideo.muted = true;
      hoverVideo.src = source;
      hoverVideo.load();
      updatePreviews();
      if (hoverTarget !== target) return;
      void hoverVideo.play().catch(() => {
        if (hoverTarget === target && hoverVideo.getAttribute('src') === source) stopRealHover();
      });
    }, 300);
  };
  document.querySelectorAll('[data-real-tile]').forEach(tile => {
    tile.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') queueRealHover(tile);
    });
    tile.addEventListener('pointerleave', () => {
      if (hoverTarget === tile && !tile.matches(':focus-visible')) stopRealHover();
    });
    tile.addEventListener('focus', () => {
      if (tile.matches(':focus-visible')) queueRealHover(tile);
    });
    tile.addEventListener('blur', () => { if (hoverTarget === tile) stopRealHover(); });
  });
  hoverVideo.addEventListener('loadeddata', () => {
    if (!hoverTarget || hoverVideo.getAttribute('src') !== hoverTarget.dataset.hoverSrc || dialogIsOpen()) return;
    hoverVideo.hidden = false;
    hoverTarget.classList.add('is-previewing');
    focusMediaItem(hoverTarget);
  });
  hoverVideo.addEventListener('error', stopRealHover);
  hoverPointer.addEventListener('change', stopRealHover);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') stopRealHover(); });
  reducedMotion.addEventListener('change', updatePreviews);
  narrowScreen.addEventListener('change', updatePreviews);
  connection?.addEventListener('change', updatePreviews);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      player.pause();
      resetMediaFocus();
    }
    updatePreviews();
  });
  window.addEventListener('pagehide', () => {
    stopRealHover();
    previews.forEach(stopPreview);
    player.pause();
  });
  window.addEventListener('pageshow', updatePreviews);

  const closeLightbox = async () => {
    if (closing || !lightbox.open) return;
    closing = true;
    player.pause();
    player.removeAttribute('src');
    player.load();
    lightbox.close();
    syncModalLock();
    if (document.fullscreenElement === lightbox) {
      try { await document.exitFullscreen(); } catch {}
    }
    enteredFullscreen = false;
    closing = false;
    lastTrigger?.focus({ preventScroll: true });
    updatePreviews();
  };

  document.querySelectorAll('.video-open, [data-real-video-open]').forEach(trigger => {
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
          typeof lightbox.showModal !== 'function') return;
      event.preventDefault();
      if (dialogIsOpen() || closing) return;
      lastTrigger = trigger;
      title.textContent = trigger.dataset.videoTitle;
      const realVideo = trigger.hasAttribute('data-real-video-open');
      lightboxContext.textContent = realVideo ? 'Real-world playback' : 'Simulation playback';
      lightbox.style.setProperty('--lightbox-aspect', trigger.dataset.videoAspect || (realVideo ? '16 / 9' : '16 / 15'));
      player.muted = trigger.dataset.videoAudio !== 'true';
      directLink.href = trigger.href;
      errorMessage.hidden = true;
      lightbox.showModal();
      syncModalLock();
      updatePreviews();
      player.src = trigger.href;
      player.load();
      void player.play().catch(() => {});
      if (lightbox.requestFullscreen) {
        void lightbox.requestFullscreen().then(() => {
          enteredFullscreen = document.fullscreenElement === lightbox;
          if (!lightbox.open && enteredFullscreen) void document.exitFullscreen().catch(() => {});
        }).catch(() => {});
      }
    });
  });
  player.addEventListener('error', () => {
    if (lightbox.open && player.hasAttribute('src')) errorMessage.hidden = false;
  });
  lightbox.querySelector('.lightbox-close').addEventListener('click', () => void closeLightbox());
  lightbox.addEventListener('cancel', event => {
    event.preventDefault();
    void closeLightbox();
  });
  lightbox.addEventListener('click', event => {
    const bounds = lightbox.getBoundingClientRect();
    if (event.target === lightbox && (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom)) void closeLightbox();
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === lightbox) enteredFullscreen = true;
    else if (enteredFullscreen && lightbox.open) void closeLightbox();
  });

  const demoSeek = demoFrame.querySelector('[data-demo-seek]');
  const demoTime = demoFrame.querySelector('[data-demo-time]');
  const fullscreenToggle = demoFrame.querySelector('[data-demo-fullscreen]');
  const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  document.querySelectorAll('[data-simulation-player], [data-real-player]').forEach(figure => {
    const video = figure.querySelector('video');
    const seek = figure.querySelector('[data-comparison-seek]');
    const time = figure.querySelector('[data-comparison-time]');
    const syncTime = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : Number(video.dataset.duration);
      const current = video.hasAttribute('src') ? video.currentTime : (positions.get(video)?.time || 0);
      time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
      seek.max = duration;
      seek.value = current;
      seek.disabled = video.readyState < 1;
      seek.setAttribute('aria-valuetext', `${formatTime(current)} of ${formatTime(duration)}`);
    };
    ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied'].forEach(event => video.addEventListener(event, syncTime));
    seek.addEventListener('input', () => {
      if (video.readyState >= 1) video.currentTime = Math.min(Number(seek.value), video.duration - .01);
    });
    syncTime();
  });
  const syncDemoTime = () => {
    const duration = Number.isFinite(demoVideo.duration) ? demoVideo.duration : 94;
    const time = demoVideo.hasAttribute('src') ? demoVideo.currentTime : (positions.get(demoVideo)?.time || 0);
    demoTime.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
    demoSeek.max = duration;
    demoSeek.value = time;
    demoSeek.disabled = demoVideo.readyState < 1;
    demoSeek.setAttribute('aria-valuetext', `${Math.floor(time / 60)} minutes ${Math.floor(time % 60)} seconds`);
  };
  ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied'].forEach(event => demoVideo.addEventListener(event, syncDemoTime));
  demoSeek.addEventListener('input', () => {
    if (demoVideo.readyState >= 1) demoVideo.currentTime = Math.min(Number(demoSeek.value), demoVideo.duration - .01);
  });
  let surfaceClick = null;
  const syncDemoFullscreen = () => {
    const wasExpanded = demoExpanded;
    demoExpanded = document.fullscreenElement === demoFrame || demoFrame.classList.contains('is-expanded');
    const label = demoExpanded ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreenToggle.setAttribute('aria-label', label);
    fullscreenToggle.title = label;
    fullscreenToggle.querySelector('img').src = `assets/icons/${demoExpanded ? 'minimize' : 'maximize'}.svg`;
    syncModalLock();
    updatePreviews();
    if (wasExpanded && !demoExpanded) fullscreenToggle.focus({ preventScroll: true });
  };
  const toggleDemoFullscreen = async () => {
    window.clearTimeout(surfaceClick);
    if (document.fullscreenElement === demoFrame) {
      try { await document.exitFullscreen(); } catch {}
    } else if (demoFrame.classList.contains('is-expanded')) {
      demoFrame.classList.remove('is-expanded');
    } else {
      try {
        if (!demoFrame.requestFullscreen) throw new Error('Fullscreen unavailable');
        await demoFrame.requestFullscreen();
      } catch {
        demoFrame.classList.add('is-expanded');
      }
    }
    syncDemoFullscreen();
  };
  fullscreenToggle.addEventListener('click', () => void toggleDemoFullscreen());
  document.addEventListener('fullscreenchange', syncDemoFullscreen);
  demoSurface.addEventListener('click', event => {
    window.clearTimeout(surfaceClick);
    const toggle = () => demoFrame.querySelector('[data-preview-toggle]').click();
    // Defer pointer clicks so a double-click opens fullscreen without toggling playback.
    if (event.detail === 0) toggle();
    else if (event.detail === 1) surfaceClick = window.setTimeout(toggle, 350);
  });
  demoSurface.addEventListener('dblclick', event => {
    event.preventDefault();
    void toggleDemoFullscreen();
  });
  document.addEventListener('keydown', event => {
    if (demoExpanded && event.key === 'Tab') {
      const controls = [...demoFrame.querySelectorAll('button:not([hidden]), input:not(:disabled), a[href]')].filter(e => e.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (event.key === 'Escape' && demoFrame.classList.contains('is-expanded')) {
      demoFrame.classList.remove('is-expanded');
      syncDemoFullscreen();
      fullscreenToggle.focus({ preventScroll: true });
    }
  });

  const panels = [...document.querySelectorAll('[data-kmppi-panel]')];
  const panelImage = panelLightbox.querySelector('[data-panel-image]');
  const panelStatus = panelLightbox.querySelector('[data-panel-status]');
  const panelTitle = panelLightbox.querySelector('#panel-viewer-title');
  const panelCounter = panelLightbox.querySelector('[data-panel-counter]');
  const panelDescription = panelLightbox.querySelector('[data-panel-description]');
  const panelOriginal = panelLightbox.querySelector('[data-panel-original]');
  const panelPrev = panelLightbox.querySelector('[data-panel-prev]');
  const panelNext = panelLightbox.querySelector('[data-panel-next]');
  let panelIndex = 0;
  let panelTrigger = null;
  let panelSwipe = null;
  const showPanel = index => {
    panelSwipe = null;
    if (index < 0 || index >= panels.length) return;
    panelIndex = index;
    const focusedControl = document.activeElement;
    panelPrev.disabled = panelIndex === 0;
    panelNext.disabled = panelIndex === panels.length - 1;
    // Keep keyboard navigation in the dialog when its focused arrow becomes disabled.
    if (focusedControl === panelPrev && panelPrev.disabled) {
      panelNext.focus({ preventScroll: true });
    } else if (focusedControl === panelNext && panelNext.disabled) {
      panelPrev.focus({ preventScroll: true });
    }
    panelPrev.title = panelPrev.disabled ? 'First image' : 'Previous image';
    panelNext.title = panelNext.disabled ? 'Last image' : 'Next image';
    const link = panels[panelIndex];
    const figure = link.closest('figure');
    panelImage.classList.add('is-loading');
    panelStatus.textContent = 'Loading image...';
    panelStatus.hidden = false;
    panelImage.alt = link.querySelector('img').alt;
    panelImage.src = link.href;
    panelOriginal.href = link.href;
    panelTitle.textContent = figure.querySelector('figcaption strong').textContent;
    panelCounter.textContent = `${panelIndex + 1} / ${panels.length}`;
    panelDescription.replaceChildren(figure.querySelector('template').content.cloneNode(true));
    panelLightbox.scrollTop = 0;
  };
  panelImage.addEventListener('load', () => {
    panelImage.classList.remove('is-loading');
    panelStatus.hidden = true;
  });
  panelImage.addEventListener('error', () => {
    panelStatus.textContent = 'Image could not be loaded.';
    panelStatus.hidden = false;
  });
  panels.forEach((link, index) => {
    if (typeof panelLightbox.showModal !== 'function') return;
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (dialogIsOpen() || closing) return;
      panelTrigger = link;
      showPanel(index);
      panelLightbox.showModal();
      syncModalLock();
      updatePreviews();
      panelLightbox.querySelector('[data-panel-close]').focus();
    });
  });
  // Reserve horizontal swipes for navigation while preserving scrolling and pinch zoom.
  panelImage.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    panelSwipe = event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  panelLightbox.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && !event.isPrimary) panelSwipe = null;
  });
  panelImage.addEventListener('pointermove', event => {
    if (!panelSwipe || event.pointerId !== panelSwipe.id) return;
    const dx = Math.abs(event.clientX - panelSwipe.x);
    const dy = Math.abs(event.clientY - panelSwipe.y);
    if (dy > 12 && dy > dx) panelSwipe = null;
  });
  panelImage.addEventListener('pointerup', event => {
    if (!panelSwipe || event.pointerId !== panelSwipe.id) return;
    const dx = event.clientX - panelSwipe.x;
    const dy = event.clientY - panelSwipe.y;
    const threshold = Math.max(40, Math.min(80, panelImage.clientWidth * .12));
    panelSwipe = null;
    if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.5) {
      showPanel(panelIndex + (dx < 0 ? 1 : -1));
    }
  });
  panelImage.addEventListener('pointercancel', () => { panelSwipe = null; });
  panelImage.addEventListener('lostpointercapture', () => { panelSwipe = null; });
  panelPrev.addEventListener('click', () => showPanel(panelIndex - 1));
  panelNext.addEventListener('click', () => showPanel(panelIndex + 1));
  panelLightbox.querySelector('[data-panel-close]').addEventListener('click', () => panelLightbox.close());
  panelLightbox.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showPanel(panelIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  panelLightbox.addEventListener('click', event => {
    const bounds = panelLightbox.getBoundingClientRect();
    if (event.target === panelLightbox && (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom)) panelLightbox.close();
  });
  panelLightbox.addEventListener('close', () => {
    panelSwipe = null;
    panelImage.removeAttribute('src');
    syncModalLock();
    panelTrigger?.focus({ preventScroll: true });
    updatePreviews();
  });
  updatePreviews();
})();
