'use client';

import { useEffect, useRef, useState } from 'react';
import { BADGES, BASE_PLOTS, CROPS, MODULES, OBJECTIVES } from '../progression/content.js';
import { baseCapacity, formatReward, inventoryCapacity, inventoryUsed, nextObjectives } from '../progression/model.js';

const tabs = ['Program', 'Build', 'Farm', 'Badges', 'Log', 'Save'];

export default function CareerPanel({ career }) {
  const [snapshot, setSnapshot] = useState(() => career.snapshot());
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('Program');
  const [cropChoice, setCropChoice] = useState('sprout');
  const [name, setName] = useState(snapshot.state.profile.name);
  const [moveId, setMoveId] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cloudMessage, setCloudMessage] = useState('');
  const [mergeMilestones, setMergeMilestones] = useState(true);
  const [checkpointChoice, setCheckpointChoice] = useState('branch');
  const importRef = useRef(null);
  useEffect(() => career.subscribe(setSnapshot), [career]);
  useEffect(() => {
    career.engine.input.suspended = open;
    if (open && document.pointerLockElement) document.exitPointerLock?.();
    return () => { career.engine.input.suspended = false; };
  }, [career, open]);
  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape') { if (career.placement) career.cancelPlacement(); else setOpen(false); return; }
      if (!open || !career.placement || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (event.key.toLowerCase() === 'r') { event.preventDefault(); career.rotatePlacement(); }
      if (event.key === 'Enter') { event.preventDefault(); career.confirmPlacement(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [career, open]);

  const { state, notice, saveStatus, placement, cloudStatus, cloudCandidate, cloudConfigured, accountEmail } = snapshot;
  const indicators = baseCapacity(state);
  const pinned = OBJECTIVES.find(item => item.id === state.settings.pinned && !state.objectives[item.id]?.complete) || nextObjectives(state)[0];
  const choices = nextObjectives(state);
  const builtTypes = new Set(state.buildings.map(item => item.type));
  const nextBuild = ['solar', 'water', 'greenhouse', 'habitat', 'lab'].find(type => !builtTypes.has(type));
  const lockReason = type => {
    const module = MODULES[type];
    const missing = (module.requires || []).filter(key => !builtTypes.has(key));
    if (missing.length) return `Build first: ${missing.map(key => MODULES[key].name).join(' + ')}`;
    const short = Object.entries(module.cost).find(([key, value]) => (state.resources[key] || 0) < value);
    if (short) return `Need ${short[1]} ${short[0]} (have ${state.resources[short[0]] || 0})`;
    if (state.buildings.length >= BASE_PLOTS.length) return 'All plots used';
    return '';
  };
  const catalog = Object.entries(MODULES).sort(([a], [b]) => (b === nextBuild) - (a === nextBuild));
  useEffect(() => {
    if (!placement || placement.plotId) return;
    const free = BASE_PLOTS.find(plot => !state.buildings.some(item => item.plotId === plot.id));
    if (free) career.selectPlot(free.id);
  }, [career, placement, state.buildings]);
  const stop = event => event.stopPropagation();
  const action = (type, extra = {}) => career.dispatch({ type, ...extra });
  const exportSave = () => {
    const blob = new Blob([career.repository.exportJson(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'dunes-career.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importSave = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_000_000) { alert('Save exceeds the 1 MB import limit.'); return; }
    if (!window.confirm('Replace this local career with the imported save? The current career will be backed up.')) return;
    try { await career.importJson(await file.text()); setName(career.state.profile.name); }
    catch (error) { alert(`Import failed: ${error.message}`); }
  };
  const cloudAction = async operation => {
    setCloudMessage('Working…');
    try { await operation(); setCloudMessage(''); setPassword(''); }
    catch (error) { setCloudMessage(error.message || 'Account action failed.'); }
  };

  return <div className="career-ui" onPointerDown={stop} onPointerUp={stop} onTouchStart={stop}>
    <div className="career-launchers">
      <button type="button" className="career-launch" onClick={() => { setTab('Program'); setOpen(true); }} aria-label="Open expedition program">EXPEDITION <span>{state.resources.materials} M · {state.resources.food} F</span></button>
      <button type="button" className="career-launch career-build-launch" onClick={() => { setTab('Build'); setOpen(true); }} aria-label="Open base construction">BUILD</button>
    </div>
    {pinned && !open && <div className="career-pinned" role="status"><b>PINNED · {pinned.track}</b><span>{pinned.title}</span></div>}
    {notice && !open && <div className="career-toast" role="status">{notice}</div>}
    {open && <section className="career-panel open" aria-label="Expedition and base panel">
      <header className="career-head"><div><strong>ARES EXPEDITION</strong><small>{saveStatus} · {state.profile.name}</small></div><button type="button" onClick={() => { career.cancelPlacement(); setOpen(false); }} aria-label="Close expedition panel">×</button></header>
      <nav className="career-tabs" aria-label="Expedition sections">{tabs.map(item => <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>
      <div className="career-scroll">
        {notice && <p className="career-notice" role="status">{notice}</p>}
        {tab === 'Program' && <>
          <div className="career-resource-row"><span>Materials <b>{state.resources.materials}</b></span><span>Research <b>{state.resources.research}</b></span><span>Food <b>{state.resources.food}</b></span></div>
          <p className="career-muted">Next expeditions are optional. Historic discoveries count even before opening this panel.</p>
          {choices.map(objective => <article className="career-card" key={objective.id}>
            <div className="career-card-title"><b>{objective.title}</b><small>{objective.track}</small></div>
            <p>{objective.description}</p><small>Reward: {formatReward(objective.reward)}</small>
            <div className="career-card-actions">
              {!objective.auto && !state.objectives[objective.id]?.acceptedAt && <button type="button" onClick={() => action('accept', { objectiveId: objective.id })}>ACCEPT</button>}
              {objective.id === 'provisions' && state.objectives.provisions?.acceptedAt && state.mission.provisionsRunId !== state.mission.runId && <button type="button" onClick={() => action('provision')}>ALLOCATE 2 FOOD</button>}
              <button type="button" className="quiet" onClick={() => action('pin', { objectiveId: objective.id })}>PIN</button>
            </div>
          </article>)}
          {state.pendingRewards.map(item => <article className="career-card" key={item.id}><b>Reward waiting: {item.id}</b><p>{formatReward(item.reward)} · free inventory space first.</p><button type="button" onClick={() => action('claim', { objectiveId: item.id })}>CLAIM REWARD</button></article>)}
          <div className="career-debrief"><b>Latest debrief</b>{state.history.slice(-3).reverse().map(item => <p key={item.id}>{item.title} · {item.detail}</p>)}<small>Suggested next: {pinned?.title || 'Explore freely'}</small></div>
        </>}
        {tab === 'Build' && <>
          <div className="career-resource-row"><span>Inventory <b>{inventoryUsed(state)}/{inventoryCapacity(state)}</b></span><span>Power <b>{indicators.power} spare</b></span><span>Water <b>{indicators.water} spare</b></span><span>Settlement <b>{indicators.settlement}</b></span></div>
          <ol className="build-guide" aria-label="Build steps">
            <li className={!placement ? 'now' : 'done'}><b>1</b> Pick a module{nextBuild ? <> — suggested: <em>{MODULES[nextBuild].name}</em></> : ' — your base is complete, expand freely'}</li>
            <li className={placement && !placement.plotId ? 'now' : placement ? 'done' : ''}><b>2</b> Choose a plot (or tap a marker on the map)</li>
            <li className={placement?.plotId ? 'now' : ''}><b>3</b> Rotate if needed, then Confirm</li>
          </ol>
          <div className="career-catalog">{catalog.map(([type, module]) => { const lock = lockReason(type); return <article className={`career-card${type === nextBuild ? ' suggested' : ''}${lock ? ' locked' : ''}`} key={type}>
            <div className="career-card-title"><b>{module.name}{type === nextBuild ? ' · NEXT' : ''}</b><small>{formatReward(module.cost)}</small></div>
            <p>{module.purpose}.</p>
            {lock && <small className="career-lock">{lock}</small>}
            <button type="button" disabled={Boolean(lock)} onClick={() => { setMoveId(null); career.startPlacement(type); }}>PLACE {module.name.toUpperCase()}</button>
          </article>; })}</div>
          {placement && <div className="career-placement" role="group" aria-label="Placement controls">
            <b>PLACEMENT MODE · {MODULES[placement.type].name}</b>
            <div className="career-plot-grid">{BASE_PLOTS.map(plot => <button key={plot.id} type="button" className={placement.plotId === plot.id ? 'selected' : ''} onClick={() => career.selectPlot(plot.id)}>{plot.id.toUpperCase()}</button>)}</div>
            <p className={placement.reason ? 'invalid' : 'valid'}>{placement.reason || `Valid plot ${placement.plotId?.toUpperCase()} · ${MODULES[placement.type].footprint.join(' × ')} m footprint · ${placement.rotation * 90}°`}</p>
            <div className="career-card-actions"><button type="button" onClick={() => career.rotatePlacement()}>ROTATE (R)</button><button type="button" disabled={!placement.plotId || Boolean(placement.reason)} onClick={() => career.confirmPlacement()}>CONFIRM (ENTER)</button><button type="button" className="quiet" onClick={() => career.cancelPlacement()}>CANCEL</button></div>
          </div>}
          <h3>Built modules</h3>
          {state.buildings.length === 0 && <p className="career-muted">No modules yet. Start with solar and water, then a greenhouse.</p>}
          {state.buildings.map(building => <article className="career-card" key={building.id}>
            <div className="career-card-title"><b>{MODULES[building.type].name}</b><small>Plot {building.plotId.toUpperCase()} · {building.active ? 'ACTIVE' : 'INACTIVE'}</small></div>
            <div className="career-card-actions"><button type="button" className="quiet" onClick={() => action('toggle', { buildingId: building.id })}>{building.active ? 'DISABLE' : 'ENABLE'}</button><button type="button" className="quiet" onClick={() => setMoveId(moveId === building.id ? null : building.id)}>RELOCATE</button><button type="button" className="quiet" onClick={() => { if (window.confirm(`Remove ${MODULES[building.type].name}? No materials are refunded.`)) action('remove', { buildingId: building.id }); }}>REMOVE</button></div>
            {moveId === building.id && <div className="career-plot-grid">{BASE_PLOTS.filter(plot => !state.buildings.some(item => item.plotId === plot.id)).map(plot => <button key={plot.id} type="button" onClick={() => { action('relocate', { buildingId: building.id, plotId: plot.id }); setMoveId(null); }}>{plot.id.toUpperCase()}</button>)}</div>}
          </article>)}
        </>}
        {tab === 'Farm' && <>
          <p className="career-muted">Growth uses real elapsed time, independent of flight time acceleration. Starter seeds are included.</p>
          <div className="career-crop-list">{Object.entries(CROPS).map(([key, crop]) => <button key={key} type="button" className={cropChoice === key ? 'active' : ''} onClick={() => setCropChoice(key)}><b>{crop.name}</b><small>{crop.durationMs / 60000} min · +{crop.yield} food</small></button>)}</div>
          {state.buildings.filter(item => item.type === 'greenhouse').map(building => <article className="career-card" key={building.id}>
            <div className="career-card-title"><b>Greenhouse · {building.plotId.toUpperCase()}</b><small>{building.active ? 'POWER + WATER ALLOCATED' : 'PAUSED · CAPACITY MISSING'}</small></div>
            {building.crop ? <><p>{CROPS[building.crop.cropId].name} · {building.crop.ready ? 'READY TO HARVEST' : `${Math.floor(building.crop.elapsedMs / building.crop.durationMs * 100)}% grown`}</p><progress max={building.crop.durationMs} value={building.crop.elapsedMs} /><button type="button" disabled={!building.crop.ready} onClick={() => action('harvest', { buildingId: building.id, cycleId: building.crop.id })}>HARVEST +{CROPS[building.crop.cropId].yield} FOOD</button></>
              : <><p>{CROPS[cropChoice].label} · {CROPS[cropChoice].durationMs / 60000} min · +{CROPS[cropChoice].yield} food</p><button type="button" disabled={!building.active} onClick={() => action('plant', { buildingId: building.id, cropId: cropChoice })}>PLANT {CROPS[cropChoice].name.toUpperCase()}</button></>}
          </article>)}
          {!state.buildings.some(item => item.type === 'greenhouse') && <p className="career-muted">Build an active greenhouse to begin farming.</p>}
        </>}
        {tab === 'Badges' && <div className="career-badge-grid">{BADGES.map(badge => <article key={badge.id} className={`career-card ${state.badges.includes(badge.id) ? '' : 'locked'}`}><b>{state.badges.includes(badge.id) ? '◆ ' : '◇ '}{badge.name}</b><p>{badge.description}</p></article>)}</div>}
        {tab === 'Log' && <><h3>Expedition history</h3>{state.history.slice().reverse().map(item => <article className="career-card" key={item.id}><div className="career-card-title"><b>{item.title}</b><small>{new Date(item.at).toLocaleString()}</small></div><p>{item.detail}</p></article>)}{state.history.length === 0 && <p className="career-muted">Your first discovery will appear here.</p>}</>}
        {tab === 'Save' && <>
          <div className="career-card"><b>Mission checkpoint</b><p>{state.mission.checkpoint ? `${state.mission.checkpoint.planet.toUpperCase()} · ${state.mission.checkpoint.phase} · ${new Date(state.mission.checkpoint.at).toLocaleString()}` : 'No supported checkpoint yet. Surface and stable orbit states are saved.'}</p><div className="career-card-actions"><button type="button" disabled={!state.mission.checkpoint} onClick={() => career.continueMission()}>CONTINUE MISSION</button><button type="button" onClick={() => career.startNewMission()}>START NEW MISSION</button></div><small>New mission keeps your base, crops, resources, badges, and objectives.</small></div>
          <div className="career-card"><label htmlFor="career-name">Program name</label><div className="career-card-actions"><input id="career-name" value={name} maxLength={40} onChange={event => setName(event.target.value)} /><button type="button" onClick={() => action('name', { name })}>SAVE NAME</button></div></div>
          <div className="career-card"><b>Local career</b><p>{saveStatus}. Export a backup before changing devices.</p><div className="career-card-actions"><button type="button" onClick={exportSave}>EXPORT JSON</button><button type="button" onClick={() => importRef.current?.click()}>IMPORT JSON</button><input ref={importRef} type="file" accept="application/json,.json" onChange={importSave} hidden /></div></div>
          <div className="career-card"><b>Optional account sync</b><p>{cloudConfigured ? `${cloudStatus}${accountEmail ? ` · ${accountEmail}` : ''}. Local saves remain immediate.` : 'Local Only · Supabase is not configured. The full guest game remains available.'}</p>
            {cloudMessage && <p role="status">{cloudMessage}</p>}
            {cloudConfigured && !accountEmail && !cloudCandidate && <><label htmlFor="career-email">Email</label><input id="career-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /><label htmlFor="career-password">Password</label><input id="career-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /><div className="career-card-actions"><button type="button" onClick={() => cloudAction(() => career.signIn(email, password))}>SIGN IN</button><button type="button" className="quiet" onClick={() => cloudAction(() => career.signIn(email, password, true))}>CREATE ACCOUNT</button></div></>}
            {cloudCandidate && <><p>Choose the base, inventory, crops, and spending branch to keep. Other branches are backed up locally. Milestones can be merged without merging resources.</p>
              <div className="career-branch-grid"><div>Guest<br />{cloudCandidate.user && `${state.buildings.length} modules · ${state.resources.materials} materials`}</div><div>Account device<br />{cloudCandidate.device.buildings.length} modules · {cloudCandidate.device.resources.materials} materials</div><div>Cloud<br />{cloudCandidate.remote ? `${cloudCandidate.remote.payload.buildings.length} modules · ${cloudCandidate.remote.payload.resources.materials} materials` : 'No cloud save yet'}</div></div>
              <label className="career-check"><input type="checkbox" checked={mergeMilestones} onChange={event => setMergeMilestones(event.target.checked)} /> Merge discoveries, badges, and deduplicated event milestones</label>
              <label htmlFor="checkpoint-choice">Mission checkpoint</label><select id="checkpoint-choice" value={checkpointChoice} onChange={event => setCheckpointChoice(event.target.value)}><option value="branch">From selected branch</option><option value="device">From account device</option><option value="cloud" disabled={!cloudCandidate.remote}>From cloud</option></select>
              <div className="career-card-actions"><button type="button" onClick={() => cloudAction(() => career.chooseAccountBranch('guest', checkpointChoice, mergeMilestones))}>USE GUEST</button><button type="button" onClick={() => cloudAction(() => career.chooseAccountBranch('device', checkpointChoice, mergeMilestones))}>USE DEVICE</button><button type="button" disabled={!cloudCandidate.remote} onClick={() => cloudAction(() => career.chooseAccountBranch('cloud', checkpointChoice, mergeMilestones))}>USE CLOUD</button></div>
            </>}
            {cloudConfigured && accountEmail && !cloudCandidate && <div className="career-card-actions"><button type="button" onClick={() => cloudAction(() => career.syncNow())}>SYNC NOW</button><button type="button" className="quiet" onClick={() => cloudAction(() => career.signOut())}>SIGN OUT</button></div>}
          </div>
          <div className="career-card"><b>Reset all progress</b><p>Deletes the active career and starts a new save generation. Your previous save is kept as a local backup.</p><button type="button" className="danger" onClick={() => { if (window.confirm('Reset ALL career progress, buildings, crops, resources, badges, and mission state?')) career.resetAll(); }}>RESET ALL PROGRESS</button></div>
        </>}
      </div>
    </section>}
  </div>;
}
