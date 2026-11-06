import test from 'node:test';
import assert from 'node:assert/strict';
import { MarsGameEngine } from '../src/game/engine.js';

test('orbital tanker docking conserves propellant and starts transfer afterward', () => {
  const events = [];
  const game = {
    missionPhysics: { phase: 'ORBIT', starshipFuel: 20, tankerActive: false, tankerStatus: '', opsMessage: '' },
    tankerOps: { active: false },
    getTransferFuelRequirement() { return 25; },
    journey: {
      tankerProgress: 0,
      startTankerRendezvous() { events.push('rendezvous'); },
      setTankerPhase(phase) { events.push(phase); },
      endTanker() { events.push('undock'); }
    },
    flightHud: { notifyTanker(phase) { events.push(phase); } },
    setTimeScale() {},
    startInterplanetaryTransfer(target) { events.push(`transfer:${target}`); }
  };
  MarsGameEngine.prototype.beginOrbitalRefuel.call(game, 'mars');
  const operation = game.tankerOps;
  for (let i = 0; i < 100 && game.tankerOps.active; i++) {
    MarsGameEngine.prototype.updateTankerOperations.call(game, .5);
  }
  assert.equal(game.missionPhysics.starshipFuel, 94);
  assert.equal(operation.transferredKg, 888000);
  assert.equal(operation.tankerRemainingKg, 312000);
  assert.ok(events.indexOf('soft-dock') < events.indexOf('docked'));
  assert.ok(events.indexOf('docked') < events.indexOf('transfer'));
  assert.ok(events.includes('transfer:mars'));
});
