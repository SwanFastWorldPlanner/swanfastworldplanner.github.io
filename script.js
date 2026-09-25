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
  const lightbox = document.querySelector('#simulation-video-lightbox');
  const player = lightbox.querySelector('.lightbox-player');
  const title = lightbox.querySelector('#simulation-video-lightbox-title');
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
  };
  let enteredFullscreen = false;
  let closing = false;

  const previewsPaused = group => userPaused.get(group) ?? (reducedMotion.matches || Boolean(connection?.saveData));
  const syncPreviewControl = group => {
    const toggle = group.querySelector('[data-preview-toggle]');
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
      if (previewsPaused(group) || document.hidden || dialogIsOpen()) {
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
    groups.forEach(syncPreviewControl);
    const candidates = document.hidden || dialogIsOpen() || closing ? [] :
      (demoExpanded ? [[demoFrame, 1]] : [...visibleGroups.entries()])
        .filter(([group, ratio]) => ratio > 0 && !previewsPaused(group))
        .sort((a, b) => {
          const distance = group => Math.abs(group.getBoundingClientRect().top +
            group.getBoundingClientRect().height / 2 - window.innerHeight / 2);
          return distance(a[0]) - distance(b[0]);
        })
        .map(([group]) => group);
    const active = [];
    let videoCount = 0;
    // Entry tiles use one decoder; comparison groups keep their paired videos.
    for (const group of candidates) {
      if (active.length >= (narrowScreen.matches ? 1 : 3)) break;
      const count = group.querySelectorAll('[data-preview-src]').length;
      if (videoCount + count <= (narrowScreen.matches ? 2 : 4)) {
        active.push(group);
        videoCount += count;
      }
    }
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
    demoSurface.hidden = false;
    demoFrame.querySelector('[data-demo-fallback]').hidden = true;
  }
  previewToggles.forEach(toggle => toggle.addEventListener('click', () => {
    const group = toggle.closest('[data-tracking-group], [data-entry-preview]');
    userPaused.set(group, !previewsPaused(group));
    updatePreviews();
  }));
  groups.forEach(syncPreviewControl);
  reducedMotion.addEventListener('change', updatePreviews);
  narrowScreen.addEventListener('change', updatePreviews);
  connection?.addEventListener('change', updatePreviews);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) player.pause();
    updatePreviews();
  });
  window.addEventListener('pagehide', () => {
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

  document.querySelectorAll('.video-open').forEach(trigger => {
    trigger.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
          typeof lightbox.showModal !== 'function') return;
      event.preventDefault();
      if (dialogIsOpen() || closing) return;
      lastTrigger = trigger;
      title.textContent = trigger.dataset.videoTitle;
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
  let panelIndex = 0;
  let panelTrigger = null;
  const showPanel = index => {
    panelIndex = (index + panels.length) % panels.length;
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
  panelLightbox.querySelector('[data-panel-prev]').addEventListener('click', () => showPanel(panelIndex - 1));
  panelLightbox.querySelector('[data-panel-next]').addEventListener('click', () => showPanel(panelIndex + 1));
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
    panelImage.removeAttribute('src');
    syncModalLock();
    panelTrigger?.focus({ preventScroll: true });
    updatePreviews();
  });
  updatePreviews();
})();
