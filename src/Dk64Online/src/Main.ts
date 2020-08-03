import {
	EventsClient,
	EventServerJoined,
	EventServerLeft,
	EventHandler,
	EventsServer,
} from 'modloader64_api/EventHandler';
import { IModLoaderAPI, IPlugin, IPluginServerConfig } from 'modloader64_api/IModLoaderAPI';
import {
	ILobbyStorage,
	INetworkPlayer,
	LobbyData,
	NetworkHandler,
	ServerNetworkHandler,
} from 'modloader64_api/NetworkHandler';
import { InjectCore } from 'modloader64_api/CoreInjection';
import { Packet } from 'modloader64_api/ModLoaderDefaultImpls';
import * as API from 'DonkeyKong64/API/Imports';
import * as Net from './network/Imports';

export class Dk64Online implements IPlugin, IPluginServerConfig {
	ModLoader = {} as IModLoaderAPI;
	name = 'Dk64Online';

	@InjectCore() core!: API.IDK64Core;

	// Storage Variables
	db = new Net.DatabaseClient();

	// Helpers
	protected serverHasStorage = false;
	protected firstTimeSendStorage = false;
	protected needDeleteActors = false;
	protected needDeleteVoxels = false;
	protected isRelease = false;
	protected skipStartupOn = true;
	protected skipTickCount = 0;

    getServerURL(): string { return "158.69.60.101:8020"; }

	get_bit(byte: number, bit: number): boolean {
		return (byte & (1 << bit)) !== 0
	}

	set_bit(byte: number, bit: number): number {
		let mask: number = (1 << bit);
		return byte |= mask;
	}

	clear_bit(byte: number, bit: number): number {
		let mask: number = (1 << bit);
		return byte &= ~mask;
	}

	toggle_bit(byte: number, bit: number): number {
		let mask: number = (1 << bit);
		return byte ^= mask;
	}

	handle_player() {
		// Initializers
		let i = 0;

		// Kong data like moves, simian slam, weapon and instrument do not have flag data tied to them, so we'll have to handle them this way.
		this.handle_moves(this.core.player.current_kong);

		for (i = 0; i < 5; i++) {
			this.handle_kong(i);
		}
	}

	handle_moves(kong_index: number) {
		// Check for Restoring Health, instrument energy and ammo.
		{
			// +1 melon and instrument energy +10
			if (
				!(this.core.player.dk.instrument & (1 << 0)) && (this.db.kong[0].instrument & (1 << 0)) ||
				!(this.core.player.diddy.instrument & (1 << 0)) && (this.db.kong[1].instrument & (1 << 0)) ||
				!(this.core.player.lanky.instrument & (1 << 0)) && (this.db.kong[2].instrument & (1 << 0)) ||
				!(this.core.player.tiny.instrument & (1 << 0)) && (this.db.kong[3].instrument & (1 << 0)) ||
				!(this.core.player.chunky.instrument & (1 << 0)) && (this.db.kong[4].instrument & (1 << 0))
			) {
				this.core.player.melons = 2;
				this.core.player.health = 8;
				this.core.player.kong[kong_index].instrument_energy = 10;
			}

			// instrument energy +15
			if (
				!(this.core.player.dk.instrument & (1 << 1)) && (this.db.kong[0].instrument & (1 << 1)) ||
				!(this.core.player.diddy.instrument & (1 << 1)) && (this.db.kong[1].instrument & (1 << 1)) ||
				!(this.core.player.lanky.instrument & (1 << 1)) && (this.db.kong[2].instrument & (1 << 1)) ||
				!(this.core.player.tiny.instrument & (1 << 1)) && (this.db.kong[3].instrument & (1 << 1)) ||
				!(this.core.player.chunky.instrument & (1 << 1)) && (this.db.kong[4].instrument & (1 << 1))
			) {
				this.core.player.kong[kong_index].instrument_energy = 15;
			}

			// +2 melon and instrument energy +20
			if (
				!(this.core.player.dk.instrument & (1 << 2)) && (this.db.kong[0].instrument & (1 << 2)) ||
				!(this.core.player.diddy.instrument & (1 << 2)) && (this.db.kong[1].instrument & (1 << 2)) ||
				!(this.core.player.lanky.instrument & (1 << 2)) && (this.db.kong[2].instrument & (1 << 2)) ||
				!(this.core.player.tiny.instrument & (1 << 2)) && (this.db.kong[3].instrument & (1 << 2)) ||
				!(this.core.player.chunky.instrument & (1 << 2)) && (this.db.kong[4].instrument & (1 << 2))
			) {
				this.core.player.melons = 3;
				this.core.player.health = 12;
				this.core.player.kong[kong_index].instrument_energy = 20;
			}

			// instrument energy +25
			if (
				!(this.core.player.dk.instrument & (1 << 3)) && (this.db.kong[0].instrument & (1 << 3)) ||
				!(this.core.player.diddy.instrument & (1 << 3)) && (this.db.kong[1].instrument & (1 << 3)) ||
				!(this.core.player.lanky.instrument & (1 << 3)) && (this.db.kong[2].instrument & (1 << 3)) ||
				!(this.core.player.tiny.instrument & (1 << 3)) && (this.db.kong[3].instrument & (1 << 3)) ||
				!(this.core.player.chunky.instrument & (1 << 3)) && (this.db.kong[4].instrument & (1 << 3))
			) {
				this.core.player.kong[kong_index].instrument_energy = 25;
			}
		}
	}

	handle_kong(index: number) {
		// Exit if Rambi or Enguarde.
		if (index > 5) return;

		// Initializers
		let kong = this.core.player.kong[index];
		let dKong = this.db.kong[index] as Net.KongData;
		let pData: Net.SyncKong;
		let needUpdate = false;

		// Update moves
		if (dKong.moves > kong.moves) {
			kong.moves = dKong.moves;
		} else if (dKong.moves < kong.moves) {
			dKong.moves = kong.moves;
			needUpdate = true;
		}

		// Update simian slam
		if (dKong.simian_slam > kong.simian_slam) {
			kong.simian_slam = dKong.simian_slam;
		} else if (dKong.simian_slam < kong.simian_slam) {
			dKong.simian_slam = kong.simian_slam;
			needUpdate = true;
		}

		// Update weapon
		if (dKong.weapon > kong.weapon) {
			kong.weapon = dKong.weapon;

			// Give the player free 50 ammo if they just unlocked their weapon.
			if (dKong.weapon === 1) this.core.player.standard_ammo = 50;

			// Give the player free 10 homing ammo if they just unlocked homing.
			if (dKong.weapon === 3) this.core.player.homing_ammo = 10;
		} else if (dKong.weapon < kong.weapon) {
			dKong.weapon = kong.weapon;
			needUpdate = true;
		}

		// Update ammo belt
		if (dKong.ammo_belt > kong.ammo_belt) {
			kong.ammo_belt = dKong.ammo_belt;

			// Give the player free 100 ammo if they just unlocked 1st ammo belt.
			if (dKong.ammo_belt === 1) this.core.player.standard_ammo = 100;

			// Give the player free 200 ammo and 20 homing ammo if they just unlocked 2nd ammo belt.
			if (dKong.ammo_belt === 2) {
				this.core.player.standard_ammo = 200;
				this.core.player.homing_ammo = 20;
			}
		} else if (dKong.ammo_belt < kong.ammo_belt) {
			dKong.ammo_belt = kong.ammo_belt;
			needUpdate = true;
		}

		// Update instrument
		if (dKong.instrument > kong.instrument) {
			kong.instrument = dKong.instrument;
		} else if (dKong.instrument < kong.instrument) {
			dKong.instrument = kong.instrument;
			needUpdate = true;
		}

		// Update Troff n Scoff Totals
		// Jungle Japes
		if (dKong.tns_bananas.jungle_japes > kong.troff_scoff_bananas.jungle_japes) {
			kong.troff_scoff_bananas.jungle_japes = dKong.tns_bananas.jungle_japes;
		} else if (dKong.tns_bananas.jungle_japes < kong.troff_scoff_bananas.jungle_japes) {
			dKong.tns_bananas.jungle_japes = kong.troff_scoff_bananas.jungle_japes;
			needUpdate = true;
		}

		// Angry Aztec
		if (dKong.tns_bananas.angry_aztec > kong.troff_scoff_bananas.angry_aztec) {
			kong.troff_scoff_bananas.angry_aztec = dKong.tns_bananas.angry_aztec;
		} else if (dKong.tns_bananas.angry_aztec < kong.troff_scoff_bananas.angry_aztec) {
			dKong.tns_bananas.angry_aztec = kong.troff_scoff_bananas.angry_aztec;
			needUpdate = true;
		}

		// Frantic Factory
		if (dKong.tns_bananas.frantic_factory > kong.troff_scoff_bananas.frantic_factory) {
			kong.troff_scoff_bananas.frantic_factory = dKong.tns_bananas.frantic_factory;
		} else if (dKong.tns_bananas.frantic_factory < kong.troff_scoff_bananas.frantic_factory) {
			dKong.tns_bananas.frantic_factory = kong.troff_scoff_bananas.frantic_factory;
			needUpdate = true;
		}

		// Gloomy Galleon
		if (dKong.tns_bananas.gloomy_galleon > kong.troff_scoff_bananas.gloomy_galleon) {
			kong.troff_scoff_bananas.gloomy_galleon = dKong.tns_bananas.gloomy_galleon;
		} else if (dKong.tns_bananas.gloomy_galleon < kong.troff_scoff_bananas.gloomy_galleon) {
			dKong.tns_bananas.gloomy_galleon = kong.troff_scoff_bananas.gloomy_galleon;
			needUpdate = true;
		}

		// Fungi Forest
		if (dKong.tns_bananas.fungi_forest > kong.troff_scoff_bananas.fungi_forest) {
			kong.troff_scoff_bananas.fungi_forest = dKong.tns_bananas.fungi_forest;
		} else if (dKong.tns_bananas.fungi_forest < kong.troff_scoff_bananas.fungi_forest) {
			dKong.tns_bananas.fungi_forest = kong.troff_scoff_bananas.fungi_forest;
			needUpdate = true;
		}

		// Crystal Caves
		if (dKong.tns_bananas.crystal_caves > kong.troff_scoff_bananas.crystal_caves) {
			kong.troff_scoff_bananas.crystal_caves = dKong.tns_bananas.crystal_caves;
		} else if (dKong.tns_bananas.crystal_caves < kong.troff_scoff_bananas.crystal_caves) {
			dKong.tns_bananas.crystal_caves = kong.troff_scoff_bananas.crystal_caves;
			needUpdate = true;
		}

		// Creepy Castle
		if (dKong.tns_bananas.creepy_castle > kong.troff_scoff_bananas.creepy_castle) {
			kong.troff_scoff_bananas.creepy_castle = dKong.tns_bananas.creepy_castle;
		} else if (dKong.tns_bananas.creepy_castle < kong.troff_scoff_bananas.creepy_castle) {
			dKong.tns_bananas.creepy_castle = kong.troff_scoff_bananas.creepy_castle;
			needUpdate = true;
		}

		if (!needUpdate) return;
		pData = new Net.SyncKong(this.ModLoader.clientLobby, dKong, index, false);
		this.ModLoader.clientSide.sendPacket(pData);
	}

	handle_game_flags(bufData: Buffer, bufStorage: Buffer, profile: number) {
		// Initializers
		let pData: Net.SyncBuffered;
		let i: number;
		let count = 0;
		let slotAddr = this.core.save.get_slot_address(profile);
		let needUpdate = false;

		bufData = this.core.save.get_slot(slotAddr);
		bufStorage = this.db.game_flags;
		count = bufData.byteLength;
		needUpdate = false;

		// Update the banana totals and coin totals. Sadly, their counter always increases, even if the flag has been set or not.
		this.handle_banana_totals(bufData);
		this.handle_coin_totals(bufData);

		for (i = 0; i < count; i++) {
			if (i === 315) continue; // ???
			if (bufData[i] === bufStorage[i]) continue;

			bufData[i] |= bufStorage[i];
			this.core.save.set_slot(slotAddr + i, bufData[i]);
			//this.ModLoader.logger.info("bufData[" + i + "]: " + bufData[i] + ", bufStorage[" + i + "]: " + bufStorage[i]);
			needUpdate = true;
		}

		// ???, bits 4-7 get cleared and set in the game so desync them.
		if (bufData[315] !== bufStorage[315]) {
			//this.ModLoader.logger.info("bufData[315] before |=: " + bufData[315] + ", bufStorage[315] before |=: " + bufStorage[315]);
			bufData[315] |= bufStorage[315];
			this.core.save.set_slot(slotAddr + 315, bufData[315]);

			bufData[315] &= 0xf;
			bufStorage[315] &= 0xf;

			//this.ModLoader.logger.info("bufData[315] after &=: " + bufData[315] + ", bufStorage[315] after &=: " + bufStorage[315]);

			if (bufData[315] !== bufStorage[315]) {
				this.ModLoader.logger.info("bufData[315]: " + bufData[315] + ", bufStorage[315]: " + bufStorage[315]);
				needUpdate = true;
			}
		}

		if (!needUpdate) return;
		this.db.game_flags = bufData;
		pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncGameFlags', bufData, false);
		this.ModLoader.clientSide.sendPacket(pData);
	}

	handle_temp_flags(bufData: Buffer, bufStorage: Buffer) {
		// Initializers
		let pData: Net.SyncBuffered;
		let i: number;
		let count = 0;
		let needUpdate = false;

		bufData = this.core.save.temp_flags.get_all();
		bufStorage = this.db.temp_flags;
		count = bufData.byteLength;

		for (i = 0; i < count; i++) {
			if (bufData[i] === bufStorage[i]) continue;

			bufData[i] |= bufStorage[i];
			this.core.save.temp_flags.set(i, bufData[i]);
			needUpdate = true;
		}

		if (!needUpdate) return;
		this.db.temp_flags = bufData;
		pData = new Net.SyncBuffered(this.ModLoader.clientLobby, 'SyncTempFlags', bufData, false);
		this.ModLoader.clientSide.sendPacket(pData);
	}

	// Update all banana totals
	handle_banana_totals(bufData: Buffer) {
		this.handle_colored_banana_totals(bufData); // Update colored bananas
		this.handle_TnS_totals(); // Update Troff n Scoff colored bananas
		this.handle_golden_banana_totals(bufData); // Update golden bananas
	}

	// Colored banana totals
	handle_colored_banana_totals(bufData: Buffer) {
		this.handle_dk_colored_bananas(bufData); // Update DK totals
		this.handle_diddy_colored_bananas(bufData); // Update Diddy totals
		this.handle_lanky_colored_bananas(bufData); // Update Lanky totals
		this.handle_tiny_colored_bananas(bufData); // Update Tiny totals
		this.handle_chunky_colored_bananas(bufData); // Update Chunky totals
	}

	handle_dk_colored_bananas(bufData: Buffer) {
		this.jj_dk_colored_bananas(bufData); // Jungle Japes
		this.aa_dk_colored_bananas(bufData); // Angry Aztec
		this.frf_dk_colored_bananas(bufData); // Frantic Factory
		this.gg_dk_colored_bananas(bufData); // Gloomy Galleon
		this.fuf_dk_colored_bananas(bufData); // Fungi Forest
		this.cryc_dk_colored_bananas(bufData); // Crystal Caves
		this.crec_dk_colored_bananas(bufData); // Creepy Castle
	}

	handle_diddy_colored_bananas(bufData: Buffer) {
		this.jj_diddy_colored_bananas(bufData); // Jungle Japes
		this.aa_diddy_colored_bananas(bufData); // Angry Aztec
		this.frf_diddy_colored_bananas(bufData); // Frantic Factory
		this.gg_diddy_colored_bananas(bufData); // Gloomy Galleon
		this.fuf_diddy_colored_bananas(bufData); // Fungi Forest
		this.cryc_diddy_colored_bananas(bufData); // Crystal Caves
		this.crec_diddy_colored_bananas(bufData); // Creepy Castle
	}

	handle_lanky_colored_bananas(bufData: Buffer) {
		this.jj_lanky_colored_bananas(bufData); // Jungle Japes
		this.aa_lanky_colored_bananas(bufData); // Angry Aztec
		this.frf_lanky_colored_bananas(bufData); // Frantic Factory
		this.gg_lanky_colored_bananas(bufData); // Gloomy Galleon
		this.fuf_lanky_colored_bananas(bufData); // Fungi Forest
		this.cryc_lanky_colored_bananas(bufData); // Crystal Caves
		this.crec_lanky_colored_bananas(bufData); // Creepy Castle
	}

	handle_tiny_colored_bananas(bufData: Buffer) {
		this.jj_tiny_colored_bananas(bufData); // Jungle Japes
		this.aa_tiny_colored_bananas(bufData); // Angry Aztec
		this.frf_tiny_colored_bananas(bufData); // Frantic Factory
		this.gg_tiny_colored_bananas(bufData); // Gloomy Galleon
		this.fuf_tiny_colored_bananas(bufData); // Fungi Forest
		this.cryc_tiny_colored_bananas(bufData); // Crystal Caves
		this.crec_tiny_colored_bananas(bufData); // Creepy Castle
	}

	handle_chunky_colored_bananas(bufData: Buffer) {
		this.jj_chunky_colored_bananas(bufData); // Jungle Japes
		this.aa_chunky_colored_bananas(bufData); // Angry Aztec
		this.frf_chunky_colored_bananas(bufData); // Frantic Factory
		this.gg_chunky_colored_bananas(bufData); // Gloomy Galleon
		this.fuf_chunky_colored_bananas(bufData); // Fungi Forest
		this.cryc_chunky_colored_bananas(bufData); // Crystal Caves
		this.crec_chunky_colored_bananas(bufData); // Creepy Castle
	}

	// Jungle Japes Colored Bananas
	jj_dk_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x4d], 7)) count += 10; // Balloon by Snide
		if (this.get_bit(bufData[0x4e], 3)) count += 10; // Balloon by Underground
		if (this.get_bit(bufData[0x4e], 4)) count += 10; // Balloon by Cranky

		// Bunches
		if (this.get_bit(bufData[0x64], 7)) count += 5; // W3 Right Bunch
		if (this.get_bit(bufData[0x65], 2)) count += 5; // Bunch on left W3
		if (this.get_bit(bufData[0x69], 7)) count += 5; // Bunch Under Hut
		if (this.get_bit(bufData[0x6c], 4)) count += 5; // T&S Bunch
		if (this.get_bit(bufData[0x6c], 6)) count += 5; // Bunch by Funky's (Tree)
		if (this.get_bit(bufData[0x6d], 5)) count += 5; // Tree Bunch (2)
		if (this.get_bit(bufData[0x6e], 7)) count += 5; // Rambi Box Bunch
		if (this.get_bit(bufData[0x70], 6)) count += 5; // Tree Bunch (1)
		if (this.get_bit(bufData[0x7c], 6)) count += 5; // Bunch in Baboon Blast (1)
		if (this.get_bit(bufData[0x83], 1)) count += 5; // Bunch in Baboon Blast (2)

		// Single
		if (this.get_bit(bufData[0x65], 0)) count += 1; // By Entrance (1)
		if (this.get_bit(bufData[0x65], 4)) count += 1; // By Entrance (2)
		if (this.get_bit(bufData[0x66], 5)) count += 1; // By Entrance (3)
		if (this.get_bit(bufData[0x66], 6)) count += 1; // By Entrance (4)
		if (this.get_bit(bufData[0x66], 7)) count += 1; // By Entrance (5)
		if (this.get_bit(bufData[0x68], 6)) count += 1; // OOBB Under Rambi Box
		if (this.get_bit(bufData[0x69], 3)) count += 1; // W4 Hallway (1)
		if (this.get_bit(bufData[0x69], 4)) count += 1; // W4 Hallway (2)
		if (this.get_bit(bufData[0x69], 5)) count += 1; // W4 Hallway (3)
		if (this.get_bit(bufData[0x6a], 0)) count += 1; // High W2 (1)
		if (this.get_bit(bufData[0x6a], 3)) count += 1; // W4 Hallway (4)
		if (this.get_bit(bufData[0x6a], 4)) count += 1; // W4 Hallway (5)
		if (this.get_bit(bufData[0x6a], 6)) count += 1; // W4 Hallway (6)
		if (this.get_bit(bufData[0x6a], 7)) count += 1; // W4 Hallway (7)
		if (this.get_bit(bufData[0x6b], 1)) count += 1; // High W2 (2)
		if (this.get_bit(bufData[0x6b], 2)) count += 1; // High W2 (3)
		if (this.get_bit(bufData[0x6b], 3)) count += 1; // High W2 (4)
		if (this.get_bit(bufData[0x6b], 6)) count += 1; // High W2 (5)
		if (this.get_bit(bufData[0x6b], 7)) count += 1; // High W2 (6)
		if (this.get_bit(bufData[0x6c], 3)) count += 1; // W4 Hallway (8)
		if (this.get_bit(bufData[0x6c], 5)) count += 1; // W4 Hallway (9)
		this.core.player.dk.colored_bananas.jungle_japes = count - this.db.kong[0].tns_bananas.jungle_japes; // Subtract the bananas spent
	}

	jj_diddy_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x4d], 4)) count += 10; // Inside Mountain Balloon
		if (this.get_bit(bufData[0x4d], 6)) count += 10; // Balloon in Cave
		if (this.get_bit(bufData[0x4e], 2)) count += 10; // Balloon by W5

		// Bunches
		if (this.get_bit(bufData[0x66], 2)) count += 5; // Mountain Bunch (1)
		if (this.get_bit(bufData[0x66], 4)) count += 5; // Mountain Bunch (2)
		if (this.get_bit(bufData[0x67], 3)) count += 5; // Mountain Bunch (3)
		if (this.get_bit(bufData[0x68], 4)) count += 5; // Bunch Under Hut
		if (this.get_bit(bufData[0x6e], 5)) count += 5; // Bunch on Tree (Middle Left)
		if (this.get_bit(bufData[0x6e], 6)) count += 5; // Bunch on Tree (Left)
		if (this.get_bit(bufData[0x72], 0)) count += 5; // Bunch in Water (Left)
		if (this.get_bit(bufData[0x72], 2)) count += 5; // Bunch in Water (Right)
		if (this.get_bit(bufData[0x72], 3)) count += 5; // Bunch on Tree (Right)
		if (this.get_bit(bufData[0x72], 5)) count += 5; // Bunch on Tree (Middle Right)

		// Single
		if (this.get_bit(bufData[0x65], 3)) count += 1; // Entrance (1)
		if (this.get_bit(bufData[0x65], 5)) count += 1; // Entrance (2)
		if (this.get_bit(bufData[0x66], 0)) count += 1; // Inside Mountain (1)
		if (this.get_bit(bufData[0x66], 1)) count += 1; // Inside Mountain (2)
		if (this.get_bit(bufData[0x66], 3)) count += 1; // 101st banana
		if (this.get_bit(bufData[0x67], 5)) count += 1; // Inside Mountain (3)
		if (this.get_bit(bufData[0x67], 6)) count += 1; // Inside Mountain (4)
		if (this.get_bit(bufData[0x67], 7)) count += 1; // Inside Mountain (5)
		if (this.get_bit(bufData[0x6a], 2)) count += 1; // Entrance (3)
		if (this.get_bit(bufData[0x6a], 5)) count += 1; // In right Tunnel (1)
		if (this.get_bit(bufData[0x6d], 3)) count += 1; // In right Tunnel (2)
		if (this.get_bit(bufData[0x6d], 4)) count += 1; // In right Tunnel (3)
		if (this.get_bit(bufData[0x6f], 4)) count += 1; // Diddy Mountain (1)
		if (this.get_bit(bufData[0x6f], 5)) count += 1; // By Entrance (1)
		if (this.get_bit(bufData[0x71], 0)) count += 1; // Diddy Mountain (2)
		if (this.get_bit(bufData[0x71], 1)) count += 1; // Diddy Mountain (3)
		if (this.get_bit(bufData[0x71], 2)) count += 1; // Diddy Mountain (4)
		if (this.get_bit(bufData[0x72], 6)) count += 1; // Diddy Mountain (5)
		if (this.get_bit(bufData[0x72], 7)) count += 1; // Diddy Mountain (6)
		if (this.get_bit(bufData[0x74], 6)) count += 1; // By Entrance (2)
		if (this.get_bit(bufData[0x79], 3)) count += 1; // Diddy Mountain (7)
		this.core.player.diddy.colored_bananas.jungle_japes = count - this.db.kong[1].tns_bananas.jungle_japes; // Subtract the bananas spent
	}

	jj_lanky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x4e], 1)) count += 10; // Balloon by Hut
		if (this.get_bit(bufData[0x4f], 1)) count += 10; // Balloon by his BP
		if (this.get_bit(bufData[0x4f], 3)) count += 10; // Balloon in Painting Room

		// Bunches
		if (this.get_bit(bufData[0x65], 1)) count += 5; // Near BP
		if (this.get_bit(bufData[0x65], 7)) count += 5; // Bunch on Tree by Cranky's
		if (this.get_bit(bufData[0x69], 6)) count += 5; // Bunch Under Hut
		if (this.get_bit(bufData[0x6a], 1)) count += 5; // Bunch under Bonus Barrel
		if (this.get_bit(bufData[0x74], 4)) count += 5; // Tree Bunch
		if (this.get_bit(bufData[0x78], 3)) count += 5; // Bunch by Snide's
		if (this.get_bit(bufData[0x7d], 0)) count += 5; // Bunch in Painting Room (Left)
		if (this.get_bit(bufData[0x7e], 3)) count += 5; // Bunch in Painting Room (Right)
		if (this.get_bit(bufData[0x7e], 4)) count += 5; // Bunch in Painting Room (1)
		if (this.get_bit(bufData[0x7e], 7)) count += 5; // Bunch in Painting Room (2)

		// Single
		if (this.get_bit(bufData[0x68], 1)) count += 1; // Bonus Barrel Room (1)
		if (this.get_bit(bufData[0x68], 5)) count += 1; // Bonus Barrel Room (2)
		if (this.get_bit(bufData[0x74], 0)) count += 1; // Bonus Barrel Room (3)
		if (this.get_bit(bufData[0x74], 1)) count += 1; // Fairy Cave (1)
		if (this.get_bit(bufData[0x74], 2)) count += 1; // Fairy Cave (2)
		if (this.get_bit(bufData[0x74], 3)) count += 1; // Fairy Cave (3)
		if (this.get_bit(bufData[0x75], 0)) count += 1; // Painting Room slope (1)
		if (this.get_bit(bufData[0x75], 1)) count += 1; // Painting Room slope (2)
		if (this.get_bit(bufData[0x75], 2)) count += 1; // In Water (1)
		if (this.get_bit(bufData[0x75], 3)) count += 1; // In Water (2)
		if (this.get_bit(bufData[0x75], 4)) count += 1; // In Water (3)
		if (this.get_bit(bufData[0x75], 5)) count += 1; // In Water (4)
		if (this.get_bit(bufData[0x75], 6)) count += 1; // In Water (5)
		if (this.get_bit(bufData[0x75], 7)) count += 1; // Fairy Cave (4)
		if (this.get_bit(bufData[0x76], 2)) count += 1; // Bonus Barrel Room (4)
		if (this.get_bit(bufData[0x76], 3)) count += 1; // Bonus Barrel Room (5)
		if (this.get_bit(bufData[0x76], 4)) count += 1; // Bonus Barrel Room (6)
		if (this.get_bit(bufData[0x76], 5)) count += 1; // Fairy Cave (5)
		if (this.get_bit(bufData[0x76], 6)) count += 1; // Bonus Barrel Room (7)
		if (this.get_bit(bufData[0x76], 7)) count += 1; // Painting Room slope (3)
		this.core.player.lanky.colored_bananas.jungle_japes = count - this.db.kong[2].tns_bananas.jungle_japes; // Subtract the bananas spent
	}

	jj_tiny_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x4e], 5)) count += 10; // Balloon by Hut
		if (this.get_bit(bufData[0x4e], 6)) count += 10; // Balloon in Fairy Room
		if (this.get_bit(bufData[0x4f], 2)) count += 10; // Balloon in Shellhive

		// Bunches
		if (this.get_bit(bufData[0x6e], 0)) count += 5; // Bunch under Hut
		if (this.get_bit(bufData[0x70], 0)) count += 5; // Log Bunch (1)
		if (this.get_bit(bufData[0x70], 1)) count += 5; // Log Bunch (2)
		if (this.get_bit(bufData[0x70], 2)) count += 5; // Log Bunch (3)
		if (this.get_bit(bufData[0x70], 3)) count += 5; // Bunch in log (1)
		if (this.get_bit(bufData[0x70], 4)) count += 5; // Bunch in log (2)
		if (this.get_bit(bufData[0x70], 5)) count += 5; // Bunch in log (3)
		if (this.get_bit(bufData[0x70], 7)) count += 5; // Bunch infront of Shellhive
		if (this.get_bit(bufData[0x77], 0)) count += 5; // Bunch on Tree by Cranky's
		if (this.get_bit(bufData[0x77], 1)) count += 5; // Bunch under Bonus Barrel

		// Single
		if (this.get_bit(bufData[0x64], 2)) count += 1; // Tunnel to Main Area (1)
		if (this.get_bit(bufData[0x64], 3)) count += 1; // Tunnel to Main Area (2)
		if (this.get_bit(bufData[0x64], 4)) count += 1; // Tunnel to Main Area (3)
		if (this.get_bit(bufData[0x64], 6)) count += 1; // Tunnel to Main Area (4)
		if (this.get_bit(bufData[0x73], 0)) count += 1; // Tunnel to Main Area (5)
		if (this.get_bit(bufData[0x73], 3)) count += 1; // Fairy Cave (1)
		if (this.get_bit(bufData[0x73], 4)) count += 1; // Fairy Cave (2)
		if (this.get_bit(bufData[0x73], 7)) count += 1; // Fairy Cave (3)
		if (this.get_bit(bufData[0x79], 0)) count += 1; // Fairy Cave (4)
		if (this.get_bit(bufData[0x79], 1)) count += 1; // Fairy Cave (5)
		if (this.get_bit(bufData[0x79], 2)) count += 1; // Fairy Cave (6)
		if (this.get_bit(bufData[0x7a], 7)) count += 1; // Fairy Cave (7)
		if (this.get_bit(bufData[0x7e], 0)) count += 1; // Inside Shellhive (1)
		if (this.get_bit(bufData[0x7e], 1)) count += 1; // Inside Shellhive (2)
		if (this.get_bit(bufData[0x7e], 2)) count += 1; // Inside Shellhive (3)
		if (this.get_bit(bufData[0x7f], 3)) count += 1; // Inside Shellhive (4)
		if (this.get_bit(bufData[0x7f], 4)) count += 1; // Inside Shellhive (5)
		if (this.get_bit(bufData[0x7f], 5)) count += 1; // Inside Shellhive (6)
		if (this.get_bit(bufData[0x7f], 6)) count += 1; // Inside Shellhive (7)
		if (this.get_bit(bufData[0x7f], 7)) count += 1; // Inside Shellhive (8)
		this.core.player.tiny.colored_bananas.jungle_japes = count - this.db.kong[3].tns_bananas.jungle_japes; // Subtract the bananas spent
	}

	jj_chunky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x4e], 0)) count += 10; // Balloon in Cave (1)
		if (this.get_bit(bufData[0x4e], 7)) count += 10; // Balloon in Cave (2)
		if (this.get_bit(bufData[0x4f], 0)) count += 10; // Balloon in Cave (3)

		// Bunches
		if (this.get_bit(bufData[0x03], 5)) count += 5; // Rock Bunch
		if (this.get_bit(bufData[0x65], 6)) count += 5; // Bunch on Funky's (Right)
		if (this.get_bit(bufData[0x6d], 0)) count += 5; // Bunch in Shellhive Area (1)
		if (this.get_bit(bufData[0x74], 5)) count += 5; // Bunch on Funky's (Left)
		if (this.get_bit(bufData[0x78], 1)) count += 5; // Bunch on top of Cranky's
		if (this.get_bit(bufData[0x7a], 5)) count += 5; // Bunch in Shellhive Area (2)
		if (this.get_bit(bufData[0x7a], 6)) count += 5; // Bunch in Shellhive Area (3)
		if (this.get_bit(bufData[0x7b], 1)) count += 5; // Bunch in Shellhive Area (4)
		if (this.get_bit(bufData[0x7c], 1)) count += 5; // Underground Bunch (1)
		if (this.get_bit(bufData[0x7c], 2)) count += 5; // Underground Bunch (2)

		// Single
		if (this.get_bit(bufData[0x64], 5)) count += 1; // Shellhive Tunnel (1)
		if (this.get_bit(bufData[0x6b], 5)) count += 1; // Shellhive Tunnel (2)
		if (this.get_bit(bufData[0x6c], 0)) count += 1; // Shellhive Tunnel (3)
		if (this.get_bit(bufData[0x6f], 3)) count += 1; // Shellhive Tunnel (4)
		if (this.get_bit(bufData[0x71], 3)) count += 1; // Shellhive Tunnel (5)
		if (this.get_bit(bufData[0x71], 4)) count += 1; // Shellhive Tunnel (6)
		if (this.get_bit(bufData[0x71], 5)) count += 1; // Shellhive Tunnel (7)
		if (this.get_bit(bufData[0x71], 6)) count += 1; // Shellhive Tunnel (8)
		if (this.get_bit(bufData[0x71], 7)) count += 1; // Shellhive Tunnel (9)
		if (this.get_bit(bufData[0x77], 3)) count += 1; // Shellhive Tunnel (10)
		if (this.get_bit(bufData[0x78], 0)) count += 1; // By underground (1)
		if (this.get_bit(bufData[0x79], 4)) count += 1; // By underground (2)
		if (this.get_bit(bufData[0x79], 5)) count += 1; // By underground (3)
		if (this.get_bit(bufData[0x79], 6)) count += 1; // By underground (4)
		if (this.get_bit(bufData[0x79], 7)) count += 1; // By underground (5)
		if (this.get_bit(bufData[0x7d], 3)) count += 1; // Underground (1)
		if (this.get_bit(bufData[0x7d], 4)) count += 1; // Underground (2)
		if (this.get_bit(bufData[0x7d], 5)) count += 1; // Underground (3)
		if (this.get_bit(bufData[0x7d], 6)) count += 1; // Underground (4)
		if (this.get_bit(bufData[0x7d], 7)) count += 1; // Underground (5)
		this.core.player.chunky.colored_bananas.jungle_japes = count - this.db.kong[4].tns_bananas.jungle_japes; // Subtract the bananas spent
	}

	// Angry Aztec Colored Bananas
	aa_dk_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x55], 0)) count += 10; // Cranky Balloon (1)
		if (this.get_bit(bufData[0x55], 2)) count += 10; // Llama Temple Rear Balloon
		if (this.get_bit(bufData[0x55], 3)) count += 10; // Cranky Balloon (2)

		// Bunches
		if (this.get_bit(bufData[0x8e], 5)) count += 5; // Oasis (1)
		if (this.get_bit(bufData[0x90], 7)) count += 5; // GB Tunnel (1)
		if (this.get_bit(bufData[0x92], 0)) count += 5; // Oasis (2)
		if (this.get_bit(bufData[0x92], 1)) count += 5; // GB Tunnel (2)
		if (this.get_bit(bufData[0x92], 2)) count += 5; // GB Tunnel (3)
		if (this.get_bit(bufData[0x92], 3)) count += 5; // GB Tunnel (4)
		if (this.get_bit(bufData[0x96], 0)) count += 5; // Kasplat Room (1)
		if (this.get_bit(bufData[0x96], 1)) count += 5; // Kasplat Room (2)
		if (this.get_bit(bufData[0x96], 2)) count += 5; // Oasis (3)

		// Single
		if (this.get_bit(bufData[0x84], 1)) count += 1; // Llama Temple Bongo Trail (1)
		if (this.get_bit(bufData[0x84], 3)) count += 1; // Llama Temple Bongo Trail (2)
		if (this.get_bit(bufData[0x84], 5)) count += 1; // Llama Temple Left Stairs (1)
		if (this.get_bit(bufData[0x84], 6)) count += 1; // Llama Temple Left Stairs (2)
		if (this.get_bit(bufData[0x84], 7)) count += 1; // Llama Temple Left Stairs (3)
		if (this.get_bit(bufData[0x8a], 0)) count += 1; // Llama Temple Left Stairs (4)
		if (this.get_bit(bufData[0x8a], 4)) count += 1; // Llama Temple Bongo Trail (4)
		if (this.get_bit(bufData[0x8b], 0)) count += 1; // Llama Temple Right Stairs (1)
		if (this.get_bit(bufData[0x8b], 1)) count += 1; // Llama Temple Right Stairs (2)
		if (this.get_bit(bufData[0x8b], 2)) count += 1; // Llama Temple Right Stairs (3)
		if (this.get_bit(bufData[0x8b], 3)) count += 1; // Llama Temple Right Stairs (4)
		if (this.get_bit(bufData[0x8b], 4)) count += 1; // Llama Temple Right Stairs (5)
		if (this.get_bit(bufData[0x8b], 5)) count += 1; // Llama Temple Left Stairs (5)
		if (this.get_bit(bufData[0x8b], 6)) count += 1; // Llama Temple Left Stairs (6)
		if (this.get_bit(bufData[0x8b], 7)) count += 1; // Llama Temple Right Stairs (6)
		if (this.get_bit(bufData[0x8d], 5)) count += 1; // Llama Temple Front (1)
		if (this.get_bit(bufData[0x8d], 6)) count += 1; // Llama Temple Front (2)
		if (this.get_bit(bufData[0x8d], 7)) count += 1; // Llama Temple Front (3)
		if (this.get_bit(bufData[0x90], 4)) count += 1; // Llama Cage (1)
		if (this.get_bit(bufData[0x90], 5)) count += 1; // Llama Cage (2)
		if (this.get_bit(bufData[0x90], 6)) count += 1; // Llama Cage (3)
		if (this.get_bit(bufData[0x97], 4)) count += 1; // Llama Temple Front (4)
		if (this.get_bit(bufData[0x97], 5)) count += 1; // Snide (1)
		if (this.get_bit(bufData[0x97], 6)) count += 1; // Snide (2)
		if (this.get_bit(bufData[0x97], 7)) count += 1; // Snide (3)
		this.core.player.dk.colored_bananas.angry_aztec = count - this.db.kong[0].tns_bananas.angry_aztec; // Subtract the bananas spent
	}

	aa_diddy_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x50], 2)) count += 10; // 5DT Balloon
		if (this.get_bit(bufData[0x55], 1)) count += 10; // W2 Balloon
		if (this.get_bit(bufData[0x55], 4)) count += 10; // W5 Balloon

		// Bunches
		if (this.get_bit(bufData[0x80], 1)) count += 5; // Tounge Bunch (1)
		if (this.get_bit(bufData[0x80], 2)) count += 5; // Tounge Bunch (2)
		if (this.get_bit(bufData[0x80], 3)) count += 5; // Tounge Bunch (3)
		if (this.get_bit(bufData[0x8d], 1)) count += 5; // W2 Bunch
		if (this.get_bit(bufData[0x94], 0)) count += 5; // Ring Bunch
		if (this.get_bit(bufData[0x94], 1)) count += 5; // Tree Bunch (1)
		if (this.get_bit(bufData[0x94], 2)) count += 5; // Tree Bunch (2)
		if (this.get_bit(bufData[0x94], 3)) count += 5; // Tree Bunch (3)
		if (this.get_bit(bufData[0x95], 7)) count += 5; // Roof Bunch

		// Single
		if (this.get_bit(bufData[0x80], 0)) count += 1; // Tiny Temple (1)
		if (this.get_bit(bufData[0x80], 4)) count += 1; // Tounge (1)
		if (this.get_bit(bufData[0x80], 5)) count += 1; // Tounge (2)
		if (this.get_bit(bufData[0x81], 0)) count += 1; // Tounge (3)
		if (this.get_bit(bufData[0x81], 6)) count += 1; // Tiny Temple (2)
		if (this.get_bit(bufData[0x81], 7)) count += 1; // Tiny Temple (3)
		if (this.get_bit(bufData[0x83], 2)) count += 1; // Tiny Temple (4)
		if (this.get_bit(bufData[0x83], 3)) count += 1; // Tiny Temple (5)
		if (this.get_bit(bufData[0x83], 4)) count += 1; // Tiny Temple (6)
		if (this.get_bit(bufData[0x83], 5)) count += 1; // Tiny Temple (7)
		if (this.get_bit(bufData[0x8c], 0)) count += 1; // Diddy Tower (1)
		if (this.get_bit(bufData[0x8c], 2)) count += 1; // Diddy Tower (2)
		if (this.get_bit(bufData[0x8c], 7)) count += 1; // Tunnel (1)
		if (this.get_bit(bufData[0x8d], 2)) count += 1; // Tunnel (2)
		if (this.get_bit(bufData[0x8d], 3)) count += 1; // Tunnel (3)
		if (this.get_bit(bufData[0x8d], 4)) count += 1; // Tunnel (4)
		if (this.get_bit(bufData[0x8e], 7)) count += 1; // Diddy Tower (3)
		if (this.get_bit(bufData[0x92], 5)) count += 1; // Tunnel (5)
		if (this.get_bit(bufData[0x92], 6)) count += 1; // Rocketbarrel (1)
		if (this.get_bit(bufData[0x93], 2)) count += 1; // Rocketbarrel (2)
		if (this.get_bit(bufData[0x95], 2)) count += 1; // Rocketbarrel (3)
		if (this.get_bit(bufData[0x95], 3)) count += 1; // 5DT Stairs (1)
		if (this.get_bit(bufData[0x95], 4)) count += 1; // 5DT Stairs (2)
		if (this.get_bit(bufData[0x95], 5)) count += 1; // 5DT Stairs (3)
		if (this.get_bit(bufData[0x95], 6)) count += 1; // 5DT Stairs (4)
		this.core.player.diddy.colored_bananas.angry_aztec = count - this.db.kong[1].tns_bananas.angry_aztec; // Subtract the bananas spent
	}

	aa_lanky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x50], 0)) count += 10; // Llama Temple Balloon (1)
		if (this.get_bit(bufData[0x50], 1)) count += 10; // Llama Temple Balloon (2)
		if (this.get_bit(bufData[0x50], 3)) count += 10; // 5DT Balloon

		// Bunches
		if (this.get_bit(bufData[0x81], 3)) count += 5; // Tiny Temple Bunch
		if (this.get_bit(bufData[0x89], 4)) count += 5; // W2 Bunch
		if (this.get_bit(bufData[0x8f], 0)) count += 5; // Matching Game Bunch
		if (this.get_bit(bufData[0x98], 0)) count += 5; // Tree Bunch (1)
		if (this.get_bit(bufData[0x98], 1)) count += 5; // Cranky Bunch
		if (this.get_bit(bufData[0x99], 4)) count += 5; // Tree Bunch (2)
		if (this.get_bit(bufData[0x99], 5)) count += 5; // Tree Bunch (3)
		if (this.get_bit(bufData[0x99], 6)) count += 5; // Tree Bunch (4)
		if (this.get_bit(bufData[0x99], 7)) count += 5; // Tree Bunch (5)

		// Single
		if (this.get_bit(bufData[0x82], 0)) count += 1; // Tiny Temple (1)
		if (this.get_bit(bufData[0x82], 1)) count += 1; // Tiny Temple (2)
		if (this.get_bit(bufData[0x82], 2)) count += 1; // Tiny Temple (3)
		if (this.get_bit(bufData[0x82], 3)) count += 1; // Tiny Temple (4)
		if (this.get_bit(bufData[0x82], 4)) count += 1; // Tiny Temple (5)
		if (this.get_bit(bufData[0x82], 5)) count += 1; // Tiny Temple (6)
		if (this.get_bit(bufData[0x83], 6)) count += 1; // Tiny Temple (7)
		if (this.get_bit(bufData[0x83], 7)) count += 1; // Tiny Temple (8)
		if (this.get_bit(bufData[0x87], 4)) count += 1; // Tiny Temple (9)
		if (this.get_bit(bufData[0x88], 0)) count += 1; // Llama Temple Stairs (1)
		if (this.get_bit(bufData[0x88], 1)) count += 1; // Llama Temple Stairs (2)
		if (this.get_bit(bufData[0x88], 2)) count += 1; // Llama Temple Stairs (3)
		if (this.get_bit(bufData[0x88], 3)) count += 1; // Llama Temple Stairs (4)
		if (this.get_bit(bufData[0x88], 4)) count += 1; // Llama Temple Stairs (5)
		if (this.get_bit(bufData[0x88], 5)) count += 1; // Llama Temple Stairs (6)
		if (this.get_bit(bufData[0x93], 3)) count += 1; // Entrance Tunnel (1)
		if (this.get_bit(bufData[0x93], 4)) count += 1; // Entrance Tunnel (2)
		if (this.get_bit(bufData[0x93], 5)) count += 1; // Entrance Tunnel (3)
		if (this.get_bit(bufData[0x93], 6)) count += 1; // Entrance Tunnel (4)
		if (this.get_bit(bufData[0x93], 7)) count += 1; // Entrance Tunnel (5)
		if (this.get_bit(bufData[0x99], 0)) count += 1; // Snake Road (1)
		if (this.get_bit(bufData[0x9a], 4)) count += 1; // Snake Road (2)
		if (this.get_bit(bufData[0x9a], 5)) count += 1; // Snake Road (3)
		if (this.get_bit(bufData[0x9a], 6)) count += 1; // Snake Road (4)
		if (this.get_bit(bufData[0x9a], 7)) count += 1; // Snake Road (5)
		this.core.player.lanky.colored_bananas.angry_aztec = count - this.db.kong[2].tns_bananas.angry_aztec; // Subtract the bananas spent
	}

	aa_tiny_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x4f], 4)) count += 10; // Tiny Temple Balloon (2)
		if (this.get_bit(bufData[0x4f], 5)) count += 10; // Tiny Temple Balloon (1)
		if (this.get_bit(bufData[0x4f], 7)) count += 10; // Llama Temple Balloon

		// Bunches
		if (this.get_bit(bufData[0x89], 2)) count += 5; // Lava Room (1)
		if (this.get_bit(bufData[0x89], 3)) count += 5; // Lava Room (2)
		if (this.get_bit(bufData[0x8e], 3)) count += 5; // Beetle
		if (this.get_bit(bufData[0x9a], 0)) count += 5; // 5DT Trees (1)
		if (this.get_bit(bufData[0x9a], 1)) count += 5; // 5DT Trees (2)
		if (this.get_bit(bufData[0x9a], 2)) count += 5; // 5DT Trees (3)
		if (this.get_bit(bufData[0x9b], 5)) count += 5; // W5
		if (this.get_bit(bufData[0x9b], 6)) count += 5; // 5DT Trees (4)
		if (this.get_bit(bufData[0x9b], 7)) count += 5; // 5DT Trees (5)

		// Single
		if (this.get_bit(bufData[0x80], 7)) count += 1; // Tiny Temple (1)
		if (this.get_bit(bufData[0x87], 0)) count += 1; // Tiny Temple (2)
		if (this.get_bit(bufData[0x87], 1)) count += 1; // Tiny Temple (3)
		if (this.get_bit(bufData[0x87], 2)) count += 1; // Tiny Temple (4)
		if (this.get_bit(bufData[0x87], 3)) count += 1; // Tiny Temple (5)
		if (this.get_bit(bufData[0x89], 0)) count += 1; // Llama Temple (1)
		if (this.get_bit(bufData[0x89], 1)) count += 1; // Llama Temple (2)
		if (this.get_bit(bufData[0x8a], 5)) count += 1; // Llama Temple (3)
		if (this.get_bit(bufData[0x8a], 6)) count += 1; // Llama Temple (4)
		if (this.get_bit(bufData[0x8a], 7)) count += 1; // Llama Temple (5)
		if (this.get_bit(bufData[0x8c], 3)) count += 1; // Tunnel (1)
		if (this.get_bit(bufData[0x8c], 4)) count += 1; // Tunnel (2)
		if (this.get_bit(bufData[0x8c], 5)) count += 1; // Tunnel (3)
		if (this.get_bit(bufData[0x8d], 0)) count += 1; // Tunnel (4)
		if (this.get_bit(bufData[0x91], 1)) count += 1; // Tunnel (5)
		if (this.get_bit(bufData[0x91], 5)) count += 1; // Tunnel (6)
		if (this.get_bit(bufData[0x93], 1)) count += 1; // Tunnel (7)
		if (this.get_bit(bufData[0x95], 0)) count += 1; // Tunnel (8)
		if (this.get_bit(bufData[0x95], 1)) count += 1; // Tunnel (9)
		if (this.get_bit(bufData[0x96], 7)) count += 1; // Tunnel (10)
		if (this.get_bit(bufData[0x9b], 0)) count += 1; // 5DT Lane (1)
		if (this.get_bit(bufData[0x9b], 1)) count += 1; // 5DT Lane (2)
		if (this.get_bit(bufData[0x9b], 2)) count += 1; // 5DT Lane (3)
		if (this.get_bit(bufData[0x9b], 3)) count += 1; // 5DT Lane (4)
		if (this.get_bit(bufData[0x9b], 4)) count += 1; // 5DT Lane (5)
		this.core.player.tiny.colored_bananas.angry_aztec = count - this.db.kong[3].tns_bananas.angry_aztec; // Subtract the bananas spent
	}

	aa_chunky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x4f], 6)) count += 10; // Battle Crown Balloon
		if (this.get_bit(bufData[0x50], 4)) count += 10; // 5DT Balloon (1)
		if (this.get_bit(bufData[0x50], 5)) count += 10; // 5DT Balloon (2)

		// Bunches
		if (this.get_bit(bufData[0x86], 0)) count += 5; // Bunch in Tiny Temple (1)
		if (this.get_bit(bufData[0x86], 1)) count += 5; // Bunch in Tiny Temple (2)
		if (this.get_bit(bufData[0x86], 2)) count += 5; // Bunch in Tiny Temple (3)
		if (this.get_bit(bufData[0x86], 3)) count += 5; // Bunch in Tiny Temple (4)
		if (this.get_bit(bufData[0x86], 4)) count += 5; // Bunch in Tiny Temple (5)
		if (this.get_bit(bufData[0x9e], 0)) count += 5; // Vase Room Bunch (1)
		if (this.get_bit(bufData[0x9e], 1)) count += 5; // Vase Room Bunch (2)
		if (this.get_bit(bufData[0x9e], 2)) count += 5; // Vase Room Bunch (3)
		if (this.get_bit(bufData[0x9f], 7)) count += 5; // Vase Room Bunch (4)

		// Single
		if (this.get_bit(bufData[0x86], 5)) count += 1; // Tiny Temple (1)
		if (this.get_bit(bufData[0x87], 5)) count += 1; // Tiny Temple (2)
		if (this.get_bit(bufData[0x87], 6)) count += 1; // Tiny Temple (3)
		if (this.get_bit(bufData[0x87], 7)) count += 1; // Tiny Temple (4)
		if (this.get_bit(bufData[0x8c], 1)) count += 1; // Entrance Tunnel (1)
		if (this.get_bit(bufData[0x8c], 6)) count += 1; // Entrance Tunnel (2)
		if (this.get_bit(bufData[0x91], 0)) count += 1; // Entrance Tunnel (3)
		if (this.get_bit(bufData[0x93], 0)) count += 1; // Entrance Tunnel (4)
		if (this.get_bit(bufData[0x96], 6)) count += 1; // Entrance Tunnel (5)
		if (this.get_bit(bufData[0x98], 5)) count += 1; // Totem (1)
		if (this.get_bit(bufData[0x98], 6)) count += 1; // Totem (2)
		if (this.get_bit(bufData[0x98], 7)) count += 1; // Totem (3)
		if (this.get_bit(bufData[0x9d], 0)) count += 1; // Snide Stairs (1)
		if (this.get_bit(bufData[0x9d], 1)) count += 1; // Snide Stairs (2)
		if (this.get_bit(bufData[0x9d], 2)) count += 1; // Snide Stairs (3)
		if (this.get_bit(bufData[0x9e], 5)) count += 1; // Snide Stairs (4)
		if (this.get_bit(bufData[0x9e], 6)) count += 1; // Snide Stairs (5)
		if (this.get_bit(bufData[0x9e], 7)) count += 1; // Snide Stairs (6)
		if (this.get_bit(bufData[0x9f], 0)) count += 1; // Totem (4)
		if (this.get_bit(bufData[0x9f], 1)) count += 1; // Totem (5)
		if (this.get_bit(bufData[0x9f], 2)) count += 1; // Totem (6)
		if (this.get_bit(bufData[0x9f], 3)) count += 1; // Totem (7)
		if (this.get_bit(bufData[0x9f], 4)) count += 1; // Totem (8)
		if (this.get_bit(bufData[0x9f], 5)) count += 1; // Totem (9)
		if (this.get_bit(bufData[0x9f], 6)) count += 1; // Totem (10)
		this.core.player.chunky.colored_bananas.angry_aztec = count - this.db.kong[4].tns_bananas.angry_aztec; // Subtract the bananas spent
	}

	// Frantic Factory Colored Bananas
	frf_dk_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x51], 5)) count += 10; // R&D Balloon
		if (this.get_bit(bufData[0x51], 6)) count += 10; // Balloon in Cranky and Candy Area
		if (this.get_bit(bufData[0x51], 7)) count += 10; // Balloon by Numbers Game

		// Bunches
		if (this.get_bit(bufData[0xbc], 2)) count += 5; // Bunch in Baboon Blast (1)
		if (this.get_bit(bufData[0xbc], 3)) count += 5; // Bunch in Baboon Blast (2)
		if (this.get_bit(bufData[0xbc], 4)) count += 5; // Bunch in Baboon Blast (3)
		if (this.get_bit(bufData[0xbc], 5)) count += 5; // Bunch in Baboon Blast (4)
		if (this.get_bit(bufData[0xbd], 0)) count += 5; // Bunch in Power Shed (GB)
		if (this.get_bit(bufData[0xbd], 1)) count += 5; // Bunch in Power Shed (Left)
		if (this.get_bit(bufData[0xbd], 2)) count += 5; // Bunch in Power Shed (Right)
		if (this.get_bit(bufData[0xbd], 4)) count += 5; // Bunch in Crusher Room (1)
		if (this.get_bit(bufData[0xbd], 5)) count += 5; // Bunch in Crusher Room (2)
		if (this.get_bit(bufData[0xbd], 6)) count += 5; // Bunch in Crusher Room (3)

		// Single
		if (this.get_bit(bufData[0xa0], 0)) count += 1; // Tunnel to Production Room (1)
		if (this.get_bit(bufData[0xa0], 1)) count += 1; // Tunnel to Production Room (2)
		if (this.get_bit(bufData[0xa0], 2)) count += 1; // Tunnel to Production Room (3)
		if (this.get_bit(bufData[0xa0], 3)) count += 1; // Hatch Tunnel (1)
		if (this.get_bit(bufData[0xa0], 4)) count += 1; // Hatch Tunnel (2)
		if (this.get_bit(bufData[0xa0], 5)) count += 1; // Storage Room Tunnel (1)
		if (this.get_bit(bufData[0xa0], 6)) count += 1; // Numbers Tunnel (1)
		if (this.get_bit(bufData[0xa0], 7)) count += 1; // Numbers Tunnel (2)
		if (this.get_bit(bufData[0xa1], 5)) count += 1; // Storage Room Tunnel (2)
		if (this.get_bit(bufData[0xa1], 6)) count += 1; // Tunnel to Production Room (4)
		if (this.get_bit(bufData[0xa1], 7)) count += 1; // Tunnel to Production Room (5)
		if (this.get_bit(bufData[0xa2], 1)) count += 1; // Tunnel to Production Room (6)
		if (this.get_bit(bufData[0xa5], 0)) count += 1; // Numbers Tunnel (3)
		if (this.get_bit(bufData[0xa5], 1)) count += 1; // Storage Room Tunnel (3)
		if (this.get_bit(bufData[0xa5], 3)) count += 1; // Hatch Tunnel (3)
		if (this.get_bit(bufData[0xa5], 4)) count += 1; // Hatch Tunnel (4)
		if (this.get_bit(bufData[0xa6], 0)) count += 1; // Numbers Tunnel (4)
		if (this.get_bit(bufData[0xa6], 6)) count += 1; // Hatch Tunnel (5)
		if (this.get_bit(bufData[0xa7], 6)) count += 1; // Tunnel to storage Room
		if (this.get_bit(bufData[0xa7], 7)) count += 1; // Numbers Tunnel (5)
		this.core.player.dk.colored_bananas.frantic_factory = count - this.db.kong[0].tns_bananas.frantic_factory; // Subtract the bananas spent
	}

	frf_diddy_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x51], 3)) count += 10; // R&D Room (1)
		if (this.get_bit(bufData[0x51], 4)) count += 10; // R&D Room (2)
		if (this.get_bit(bufData[0x52], 0)) count += 10; // R&D Room (3)

		// Bunches
		if (this.get_bit(bufData[0xaa], 0)) count += 5; // Block Tower Bunch (1)
		if (this.get_bit(bufData[0xaa], 1)) count += 5; // W5 Bunch (Arcade)
		if (this.get_bit(bufData[0xaa], 2)) count += 5; // W5 Bunch (Funky)
		if (this.get_bit(bufData[0xaa], 3)) count += 5; // Prodution Room (1)
		if (this.get_bit(bufData[0xaa], 4)) count += 5; // Prodution Room (2)
		if (this.get_bit(bufData[0xaa], 5)) count += 5; // Prodution Room (3)
		if (this.get_bit(bufData[0xab], 4)) count += 5; // Block Tower Bunch (2)
		if (this.get_bit(bufData[0xab], 5)) count += 5; // Block Tower Bunch (3)
		if (this.get_bit(bufData[0xab], 6)) count += 5; // Block Tower Bunch (4)
		if (this.get_bit(bufData[0xab], 7)) count += 5; // Block Tower Bunch (5)

		// Single
		if (this.get_bit(bufData[0xa4], 2)) count += 1; // Low W4 (1)
		if (this.get_bit(bufData[0xa4], 3)) count += 1; // Low W4 (2)
		if (this.get_bit(bufData[0xa4], 4)) count += 1; // Low W4 (3)
		if (this.get_bit(bufData[0xa4], 5)) count += 1; // Low W4 (4)
		if (this.get_bit(bufData[0xa4], 6)) count += 1; // Low W4 (5)
		if (this.get_bit(bufData[0xa4], 7)) count += 1; // Arcade Tunnel (1)
		if (this.get_bit(bufData[0xa5], 6)) count += 1; // Low W4 (6)
		if (this.get_bit(bufData[0xa6], 1)) count += 1; // Arcade Tunnel (2)
		if (this.get_bit(bufData[0xa6], 2)) count += 1; // Arcade Tunnel (3)
		if (this.get_bit(bufData[0xa6], 3)) count += 1; // Arcade Tunnel (4)
		if (this.get_bit(bufData[0xa7], 0)) count += 1; // Low W4 (7)
		if (this.get_bit(bufData[0xa7], 1)) count += 1; // Low W4 (8)
		if (this.get_bit(bufData[0xa7], 2)) count += 1; // Low W4 (9)
		if (this.get_bit(bufData[0xa7], 3)) count += 1; // Low W4 (10)
		if (this.get_bit(bufData[0xa7], 4)) count += 1; // Low W4 (11)
		if (this.get_bit(bufData[0xa7], 5)) count += 1; // Arcade Tunnel (5)
		if (this.get_bit(bufData[0xab], 0)) count += 1; // Funky Tunnel (1)
		if (this.get_bit(bufData[0xab], 1)) count += 1; // Funky Tunnel (2)
		if (this.get_bit(bufData[0xab], 2)) count += 1; // Funky Tunnel (3)
		if (this.get_bit(bufData[0xab], 3)) count += 1; // Low W4 (12)
		this.core.player.diddy.colored_bananas.frantic_factory = count - this.db.kong[1].tns_bananas.frantic_factory; // Subtract the bananas spent
	}

	frf_lanky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x51], 1)) count += 10; // Balloon by F Key
		if (this.get_bit(bufData[0x52], 3)) count += 10; // Production Room
		if (this.get_bit(bufData[0x54], 7)) count += 10; // Crusher Room Balloon

		// Bunches
		if (this.get_bit(bufData[0xb6], 0)) count += 5; // Production Room (1)
		if (this.get_bit(bufData[0xb6], 1)) count += 5; // Production Room (2)
		if (this.get_bit(bufData[0xb6], 2)) count += 5; // Production Room (3)
		if (this.get_bit(bufData[0xb6], 3)) count += 5; // W2 Bunch
		if (this.get_bit(bufData[0xb6], 4)) count += 5; // R&D Bunch
		if (this.get_bit(bufData[0xb7], 3)) count += 5; // Production Room (4)
		if (this.get_bit(bufData[0xb7], 4)) count += 5; // Production Room (5)
		if (this.get_bit(bufData[0xb7], 5)) count += 5; // Production Room (6)
		if (this.get_bit(bufData[0xb7], 6)) count += 5; // Production Room (7)
		if (this.get_bit(bufData[0xb7], 7)) count += 5; // Production Room (8)

		// Single
		if (this.get_bit(bufData[0xa8], 4)) count += 1; // R&D (1)
		if (this.get_bit(bufData[0xa9], 4)) count += 1; // R&D (2)
		if (this.get_bit(bufData[0xa9], 6)) count += 1; // R&D (3)
		if (this.get_bit(bufData[0xac], 5)) count += 1; // R&D (4)
		if (this.get_bit(bufData[0xac], 6)) count += 1; // R&D (5)
		if (this.get_bit(bufData[0xb0], 1)) count += 1; // Cranky and Candy Area (1)
		if (this.get_bit(bufData[0xb0], 2)) count += 1; // Cranky and Candy Area (2)
		if (this.get_bit(bufData[0xb0], 3)) count += 1; // Cranky and Candy Area (3)
		if (this.get_bit(bufData[0xb0], 4)) count += 1; // Cranky and Candy Area (4)
		if (this.get_bit(bufData[0xb0], 5)) count += 1; // Cranky and Candy Area (5)
		if (this.get_bit(bufData[0xb0], 6)) count += 1; // Storage Room Pipe (1)
		if (this.get_bit(bufData[0xb0], 7)) count += 1; // Storage Room Pipe (2)
		if (this.get_bit(bufData[0xb2], 2)) count += 1; // R&D (6)
		if (this.get_bit(bufData[0xb2], 3)) count += 1; // R&D (7)
		if (this.get_bit(bufData[0xb2], 4)) count += 1; // R&D (8)
		if (this.get_bit(bufData[0xb2], 5)) count += 1; // R&D (9)
		if (this.get_bit(bufData[0xb2], 6)) count += 1; // R&D (10)
		if (this.get_bit(bufData[0xb7], 0)) count += 1; // Storage Room Pipe (3)
		if (this.get_bit(bufData[0xb7], 1)) count += 1; // Storage Room Pipe (4)
		if (this.get_bit(bufData[0xb7], 2)) count += 1; // Storage Room Pipe (5)
		this.core.player.lanky.colored_bananas.frantic_factory = count - this.db.kong[2].tns_bananas.frantic_factory; // Subtract the bananas spent
	}

	frf_tiny_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x51], 2)) count += 10; // Balloon by Snide
		if (this.get_bit(bufData[0x52], 1)) count += 10; // Production Room
		if (this.get_bit(bufData[0x52], 2)) count += 10; // Balloon by Funky

		// Bunches
		if (this.get_bit(bufData[0xac], 0)) count += 5; // Bad Hit Detection Wheel (1)
		if (this.get_bit(bufData[0xac], 1)) count += 5; // Window Bunch (Left)
		if (this.get_bit(bufData[0xac], 2)) count += 5; // Window Bunch (Right)
		if (this.get_bit(bufData[0xad], 1)) count += 5; // Bad Hit Detection Wheel (2)
		if (this.get_bit(bufData[0xad], 2)) count += 5; // Bunch Production Room (1)
		if (this.get_bit(bufData[0xad], 3)) count += 5; // Bunch Production Room (2)
		if (this.get_bit(bufData[0xad], 4)) count += 5; // Bunch Production Room (3)
		if (this.get_bit(bufData[0xad], 5)) count += 5; // Bunch Production Room (4)
		if (this.get_bit(bufData[0xad], 6)) count += 5; // Bunch Production Room (5)
		if (this.get_bit(bufData[0xad], 7)) count += 5; // Arcade Bunch

		// Single
		if (this.get_bit(bufData[0xa8], 5)) count += 1; // Foyer Tunnel (1)
		if (this.get_bit(bufData[0xa8], 6)) count += 1; // Foyer Tunnel (2)
		if (this.get_bit(bufData[0xa8], 7)) count += 1; // Foyer Tunnel (3)
		if (this.get_bit(bufData[0xad], 0)) count += 1; // R&D Tunnel (1)
		if (this.get_bit(bufData[0xae], 0)) count += 1; // R&D Tunnel (2)
		if (this.get_bit(bufData[0xae], 1)) count += 1; // R&D Tunnel (3)
		if (this.get_bit(bufData[0xae], 2)) count += 1; // R&D Tunnel (4)
		if (this.get_bit(bufData[0xae], 3)) count += 1; // R&D Tunnel (5)
		if (this.get_bit(bufData[0xae], 4)) count += 1; // R&D Tunnel (6)
		if (this.get_bit(bufData[0xae], 5)) count += 1; // R&D Tunnel (7)
		if (this.get_bit(bufData[0xae], 6)) count += 1; // R&D Tunnel (8)
		if (this.get_bit(bufData[0xae], 7)) count += 1; // R&D Tunnel (9)
		if (this.get_bit(bufData[0xaf], 0)) count += 1; // Testing Room Tunnel (1)
		if (this.get_bit(bufData[0xaf], 1)) count += 1; // Testing Room Tunnel (2)
		if (this.get_bit(bufData[0xaf], 2)) count += 1; // Testing Room Tunnel (3)
		if (this.get_bit(bufData[0xaf], 3)) count += 1; // Testing Room Tunnel (4)
		if (this.get_bit(bufData[0xaf], 4)) count += 1; // Testing Room Tunnel (5)
		if (this.get_bit(bufData[0xaf], 5)) count += 1; // Testing Room Tunnel (6)
		if (this.get_bit(bufData[0xaf], 6)) count += 1; // Testing Room Tunnel (7)
		if (this.get_bit(bufData[0xaf], 7)) count += 1; // R&D Tunnel (10)
		this.core.player.tiny.colored_bananas.frantic_factory = count - this.db.kong[3].tns_bananas.frantic_factory; // Subtract the bananas spent
	}

	frf_chunky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x50], 7)) count += 10; // Hatch
		if (this.get_bit(bufData[0x51], 0)) count += 10; // Balloon above Snide
		if (this.get_bit(bufData[0x52], 4)) count += 10; // Toy monster

		// Bunches
		if (this.get_bit(bufData[0xa1], 2)) count += 5; // Production Room (1)
		if (this.get_bit(bufData[0xa1], 3)) count += 5; // Dark Room Bunch (1)
		if (this.get_bit(bufData[0xa1], 4)) count += 5; // Dark Room Bunch (2)
		if (this.get_bit(bufData[0xa2], 4)) count += 5; // Production Room (2)
		if (this.get_bit(bufData[0xb8], 2)) count += 5; // Production Room (3)
		if (this.get_bit(bufData[0xb8], 3)) count += 5; // Production Room (4)
		if (this.get_bit(bufData[0xb9], 1)) count += 5; // W3 by Snide's Bunch
		if (this.get_bit(bufData[0xba], 4)) count += 5; // W1 Foyer
		if (this.get_bit(bufData[0xba], 5)) count += 5; // Storage Room W1
		if (this.get_bit(bufData[0xba], 6)) count += 5; // Dark Room (3)

		// Single
		if (this.get_bit(bufData[0xb4], 0)) count += 1; // Hatch Pole (1)
		if (this.get_bit(bufData[0xb4], 1)) count += 1; // Hatch Pole (2)
		if (this.get_bit(bufData[0xb4], 2)) count += 1; // Hatch Pole (3)
		if (this.get_bit(bufData[0xb4], 3)) count += 1; // Hatch Pole (4)
		if (this.get_bit(bufData[0xb4], 4)) count += 1; // Hatch Pole (5)
		if (this.get_bit(bufData[0xb4], 5)) count += 1; // Hatch Pole (6)
		if (this.get_bit(bufData[0xb4], 6)) count += 1; // Toy Monster (1)
		if (this.get_bit(bufData[0xb4], 7)) count += 1; // Toy Monster (2)
		if (this.get_bit(bufData[0xb5], 4)) count += 1; // Hatch Pole (7)
		if (this.get_bit(bufData[0xb5], 5)) count += 1; // Hatch Pole (8)
		if (this.get_bit(bufData[0xb5], 6)) count += 1; // Hatch Pole (9)
		if (this.get_bit(bufData[0xb5], 7)) count += 1; // Hatch Pole (10)
		if (this.get_bit(bufData[0xbb], 0)) count += 1; // Toy Monster (3)
		if (this.get_bit(bufData[0xbb], 1)) count += 1; // Toy Monster (4)
		if (this.get_bit(bufData[0xbb], 2)) count += 1; // Toy Monster (5)
		if (this.get_bit(bufData[0xbb], 3)) count += 1; // Toy Monster (6)
		if (this.get_bit(bufData[0xbb], 4)) count += 1; // Toy Monster (7)
		if (this.get_bit(bufData[0xbb], 5)) count += 1; // Toy Monster (8)
		if (this.get_bit(bufData[0xbb], 6)) count += 1; // Toy Monster (9)
		if (this.get_bit(bufData[0xbb], 7)) count += 1; // Toy Monster (10)
		this.core.player.chunky.colored_bananas.frantic_factory = count - this.db.kong[4].tns_bananas.frantic_factory; // Subtract the bananas spent
	}

	// Gloomy Galleon Colored Bananas
	gg_dk_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x53], 4)) count += 10; // Balloon outside lighthouse
		if (this.get_bit(bufData[0x53], 5)) count += 10; // Chests Balloon
		if (this.get_bit(bufData[0x56], 5)) count += 10; // Lighthouse Balloon

		// Bunches
		if (this.get_bit(bufData[0xc1], 5)) count += 5; // 5DS Area Bunch (1)
		if (this.get_bit(bufData[0xc1], 6)) count += 5; // 5DS Area Bunch (2)
		if (this.get_bit(bufData[0xc1], 7)) count += 5; // 5DS Area Bunch (3)
		if (this.get_bit(bufData[0xdd], 0)) count += 5; // Baboon Blast Bunch (3)
		if (this.get_bit(bufData[0xde], 2)) count += 5; // Lighthouse Bunch (1)
		if (this.get_bit(bufData[0xde], 3)) count += 5; // Lighthouse Bunch (2)
		if (this.get_bit(bufData[0xde], 4)) count += 5; // Lighthouse Bunch (3)
		if (this.get_bit(bufData[0xde], 5)) count += 5; // Lighthouse Bunch (4)
		if (this.get_bit(bufData[0xde], 6)) count += 5; // Baboon Blast Bunch (1)
		if (this.get_bit(bufData[0xde], 7)) count += 5; // Baboon Blast Bunch (2)

		// Single
		if (this.get_bit(bufData[0xc2], 0)) count += 1; // Lighthouse T&S (1)
		if (this.get_bit(bufData[0xc2], 1)) count += 1; // Lighthouse T&S (2)
		if (this.get_bit(bufData[0xc2], 2)) count += 1; // Lighthouse T&S (3)
		if (this.get_bit(bufData[0xc2], 3)) count += 1; // Lighthouse T&S (4)
		if (this.get_bit(bufData[0xc2], 4)) count += 1; // Lighthouse T&S (5)
		if (this.get_bit(bufData[0xc2], 5)) count += 1; // Lighthouse T&S (6)
		if (this.get_bit(bufData[0xc2], 6)) count += 1; // Lighthouse T&S (7)
		if (this.get_bit(bufData[0xc3], 7)) count += 1; // Lighthouse T&S (8)
		if (this.get_bit(bufData[0xd0], 7)) count += 1; // Lighthouse T&S (9)
		if (this.get_bit(bufData[0xd7], 0)) count += 1; // Lighthouse T&S (10)
		if (this.get_bit(bufData[0xd8], 0)) count += 1; // 5DS (10)
		if (this.get_bit(bufData[0xd9], 1)) count += 1; // 5DS (1)
		if (this.get_bit(bufData[0xd9], 2)) count += 1; // 5DS (2)
		if (this.get_bit(bufData[0xd9], 3)) count += 1; // 5DS (3)
		if (this.get_bit(bufData[0xd9], 4)) count += 1; // 5DS (4)
		if (this.get_bit(bufData[0xd9], 5)) count += 1; // 5DS (5)
		if (this.get_bit(bufData[0xd9], 6)) count += 1; // 5DS (6)
		if (this.get_bit(bufData[0xd9], 7)) count += 1; // 5DS (7)
		if (this.get_bit(bufData[0xda], 6)) count += 1; // 5DS (8)
		if (this.get_bit(bufData[0xda], 7)) count += 1; // 5DS (9)
		this.core.player.dk.colored_bananas.gloomy_galleon = count - this.db.kong[0].tns_bananas.gloomy_galleon; // Subtract the bananas spent
	}

	gg_diddy_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x52], 6)) count += 10; // Cactus Balloon
		if (this.get_bit(bufData[0x53], 3)) count += 10; // Seal Cage Balloon
		if (this.get_bit(bufData[0x53], 6)) count += 10; // Gold tower Balloon

		// Bunches
		if (this.get_bit(bufData[0xc5], 0)) count += 5; // Cranky Bunch (1)
		if (this.get_bit(bufData[0xc5], 1)) count += 5; // Cranky Bunch (2)
		if (this.get_bit(bufData[0xc5], 2)) count += 5; // Mechfish Bunch (1)
		if (this.get_bit(bufData[0xc5], 3)) count += 5; // Mechfish Bunch (2)
		if (this.get_bit(bufData[0xc5], 4)) count += 5; // Mechfish Bunch (3)
		if (this.get_bit(bufData[0xc5], 5)) count += 5; // Mechfish Bunch (4)
		if (this.get_bit(bufData[0xc7], 0)) count += 5; // Lighthouse Bunch (1)
		if (this.get_bit(bufData[0xc7], 1)) count += 5; // Lighthouse Bunch (2)
		if (this.get_bit(bufData[0xd5], 3)) count += 5; // 5DS Bunch (1)
		if (this.get_bit(bufData[0xd5], 4)) count += 5; // 5DS Bunch (2)

		// Single
		if (this.get_bit(bufData[0xc0], 6)) count += 1; // Gold Tower Tunnel (1)
		if (this.get_bit(bufData[0xc0], 7)) count += 1; // Gold Tower Tunnel (2)
		if (this.get_bit(bufData[0xc6], 0)) count += 1; // 2DS (1)
		if (this.get_bit(bufData[0xc6], 1)) count += 1; // 2DS (2)
		if (this.get_bit(bufData[0xc6], 2)) count += 1; // 2DS (3)
		if (this.get_bit(bufData[0xc6], 3)) count += 1; // 2DS (4)
		if (this.get_bit(bufData[0xc6], 4)) count += 1; // Gold Tower Tunnel (3)
		if (this.get_bit(bufData[0xc6], 5)) count += 1; // Gold Tower Tunnel (4)
		if (this.get_bit(bufData[0xc6], 6)) count += 1; // Gold Tower Tunnel (5)
		if (this.get_bit(bufData[0xc6], 7)) count += 1; // Gold Tower Tunnel (6)
		if (this.get_bit(bufData[0xc7], 2)) count += 1; // 2DS (5)
		if (this.get_bit(bufData[0xc7], 3)) count += 1; // 2DS (6)
		if (this.get_bit(bufData[0xc7], 4)) count += 1; // 2DS (7)
		if (this.get_bit(bufData[0xc7], 5)) count += 1; // 2DS (8)
		if (this.get_bit(bufData[0xc7], 6)) count += 1; // 2DS (9)
		if (this.get_bit(bufData[0xc7], 7)) count += 1; // 2DS (10)
		if (this.get_bit(bufData[0xd5], 0)) count += 1; // 5DS (1)
		if (this.get_bit(bufData[0xd5], 1)) count += 1; // 5DS (2)
		if (this.get_bit(bufData[0xd5], 2)) count += 1; // 5DS (3)
		if (this.get_bit(bufData[0xd6], 7)) count += 1; // 5DS (4)
		this.core.player.diddy.colored_bananas.gloomy_galleon = count - this.db.kong[1].tns_bananas.gloomy_galleon; // Subtract the bananas spent
	}

	gg_lanky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x53], 0)) count += 10; // Crown Balloon (1)
		if (this.get_bit(bufData[0x53], 1)) count += 10; // Crown Balloon (2)
		if (this.get_bit(bufData[0x54], 1)) count += 10; // 5DS Balloon

		// Bunches
		if (this.get_bit(bufData[0xce], 5)) count += 5; // Enguarde Box Bunch
		if (this.get_bit(bufData[0xce], 6)) count += 5; // Instrument Pad Bunch
		if (this.get_bit(bufData[0xd2], 0)) count += 5; // Chest Bunch (1)
		if (this.get_bit(bufData[0xd2], 1)) count += 5; // Chest Bunch (2)
		if (this.get_bit(bufData[0xd3], 6)) count += 5; // Chest Bunch (3)
		if (this.get_bit(bufData[0xd3], 7)) count += 5; // Chest Bunch (4)
		if (this.get_bit(bufData[0xd4], 0)) count += 5; // 5DS Bunch (1)
		if (this.get_bit(bufData[0xd4], 1)) count += 5; // 5DS Bunch (2)
		if (this.get_bit(bufData[0xd4], 2)) count += 5; // 5DS Bunch (3)
		if (this.get_bit(bufData[0xdf], 5)) count += 5; // 2DS Bunch (1)

		// Single
		if (this.get_bit(bufData[0xc8], 6)) count += 1; // Hallway (1)
		if (this.get_bit(bufData[0xc8], 7)) count += 1; // Hallway (2)
		if (this.get_bit(bufData[0xce], 0)) count += 1; // Gold Tower (1)
		if (this.get_bit(bufData[0xce], 1)) count += 1; // Gold Tower (2)
		if (this.get_bit(bufData[0xce], 2)) count += 1; // Gold Tower (3)
		if (this.get_bit(bufData[0xce], 3)) count += 1; // Gold Tower (4)
		if (this.get_bit(bufData[0xce], 4)) count += 1; // Gold Tower (5)
		if (this.get_bit(bufData[0xcf], 0)) count += 1; // Hallway (3)
		if (this.get_bit(bufData[0xcf], 1)) count += 1; // Hallway (4)
		if (this.get_bit(bufData[0xcf], 2)) count += 1; // Hallway (5)
		if (this.get_bit(bufData[0xcf], 3)) count += 1; // Enguarde Box (1)
		if (this.get_bit(bufData[0xcf], 4)) count += 1; // Enguarde Box (2)
		if (this.get_bit(bufData[0xcf], 5)) count += 1; // Enguarde Box (3)
		if (this.get_bit(bufData[0xcf], 6)) count += 1; // Enguarde Box (4)
		if (this.get_bit(bufData[0xcf], 7)) count += 1; // Enguarde Box (5)
		if (this.get_bit(bufData[0xd8], 7)) count += 1; // 2DS (1)
		if (this.get_bit(bufData[0xdf], 0)) count += 1; // 2DS (2)
		if (this.get_bit(bufData[0xdf], 1)) count += 1; // 2DS (3)
		if (this.get_bit(bufData[0xdf], 2)) count += 1; // 2DS (4)
		if (this.get_bit(bufData[0xdf], 3)) count += 1; // 2DS (5)
		this.core.player.lanky.colored_bananas.gloomy_galleon = count - this.db.kong[2].tns_bananas.gloomy_galleon; // Subtract the bananas spent
	}

	gg_tiny_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x52], 7)) count += 10; // Diddy Kasplat Balloon
		if (this.get_bit(bufData[0x54], 2)) count += 10; // Snide's Balloon
		if (this.get_bit(bufData[0x54], 3)) count += 10; // Gold tower Balloon

		// Bunches
		if (this.get_bit(bufData[0xcc], 5)) count += 5; // W3 Bunch (1)
		if (this.get_bit(bufData[0xcc], 6)) count += 5; // W3 Bunch (2)
		if (this.get_bit(bufData[0xcc], 7)) count += 5; // Gold Tower Bunch
		if (this.get_bit(bufData[0xd3], 0)) count += 5; // Cannon Bunch (1)
		if (this.get_bit(bufData[0xd3], 1)) count += 5; // Cannon Bunch (2)
		if (this.get_bit(bufData[0xd3], 2)) count += 5; // Cannon Bunch (3)
		if (this.get_bit(bufData[0xd8], 6)) count += 5; // 2DS Bunch (1)
		if (this.get_bit(bufData[0xd9], 0)) count += 5; // 5DS Bunch (1)
		if (this.get_bit(bufData[0xdb], 4)) count += 5; // 5DS Bunch (2)
		if (this.get_bit(bufData[0xdf], 4)) count += 5; // 2DS Bunch (2)

		// Single
		if (this.get_bit(bufData[0xcc], 0)) count += 1; // Hallway (1)
		if (this.get_bit(bufData[0xcc], 1)) count += 1; // Hallway (2)
		if (this.get_bit(bufData[0xcc], 2)) count += 1; // Hallway (3)
		if (this.get_bit(bufData[0xcc], 3)) count += 1; // Hallway (4)
		if (this.get_bit(bufData[0xcc], 4)) count += 1; // Hallway (5)
		if (this.get_bit(bufData[0xcd], 1)) count += 1; // Near Kasplat (1)
		if (this.get_bit(bufData[0xcd], 2)) count += 1; // Near Kasplat (2)
		if (this.get_bit(bufData[0xcd], 3)) count += 1; // Near Kasplat (3)
		if (this.get_bit(bufData[0xcd], 4)) count += 1; // Hallway (6)
		if (this.get_bit(bufData[0xcd], 5)) count += 1; // Hallway (7)
		if (this.get_bit(bufData[0xcd], 6)) count += 1; // Hallway (8)
		if (this.get_bit(bufData[0xcd], 7)) count += 1; // Hallway (9)
		if (this.get_bit(bufData[0xd8], 1)) count += 1; // 5DS OOB
		if (this.get_bit(bufData[0xd8], 2)) count += 1; // 5DS (1)
		if (this.get_bit(bufData[0xd8], 3)) count += 1; // 5DS (2)
		if (this.get_bit(bufData[0xd8], 4)) count += 1; // 5DS (3)
		if (this.get_bit(bufData[0xd8], 5)) count += 1; // 5DS (4)
		if (this.get_bit(bufData[0xda], 0)) count += 1; // 5DS (5)
		if (this.get_bit(bufData[0xda], 1)) count += 1; // 5DS (6)
		if (this.get_bit(bufData[0xda], 2)) count += 1; // 5DS (7)
		if (this.get_bit(bufData[0xdb], 7)) count += 1; // 5DS (8)
		this.core.player.tiny.colored_bananas.gloomy_galleon = count - this.db.kong[3].tns_bananas.gloomy_galleon; // Subtract the bananas spent
	}

	gg_chunky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x53], 2)) count += 10; // Cactus Balloon
		if (this.get_bit(bufData[0x53], 7)) count += 10; // Cannon Game Balloon
		if (this.get_bit(bufData[0x54], 0)) count += 10; // 2DS Balloon

		// Bunches
		if (this.get_bit(bufData[0xc9], 3)) count += 5; // W2 Bunch (1)
		if (this.get_bit(bufData[0xc9], 4)) count += 5; // W2 Bunch (2)
		if (this.get_bit(bufData[0xc9], 5)) count += 5; // 5DS Area Bunch (1)
		if (this.get_bit(bufData[0xc9], 6)) count += 5; // 5DS Area Bunch (2)
		if (this.get_bit(bufData[0xc9], 7)) count += 5; // 5DS Area Bunch (3)
		if (this.get_bit(bufData[0xd6], 0)) count += 5; // Ship Bunch (1)
		if (this.get_bit(bufData[0xd6], 1)) count += 5; // Ship Bunch (2)
		if (this.get_bit(bufData[0xd6], 2)) count += 5; // Ship Bunch (5)
		if (this.get_bit(bufData[0xd7], 6)) count += 5; // Ship Bunch (3)
		if (this.get_bit(bufData[0xd7], 7)) count += 5; // Ship Bunch (4)

		// Single
		if (this.get_bit(bufData[0xc4], 7)) count += 1; // Cranky Area (1)
		if (this.get_bit(bufData[0xc9], 0)) count += 1; // Lighthouse Underwater (1)
		if (this.get_bit(bufData[0xc9], 1)) count += 1; // Lighthouse Underwater (2)
		if (this.get_bit(bufData[0xc9], 2)) count += 1; // Lighthouse Underwater (3)
		if (this.get_bit(bufData[0xca], 0)) count += 1; // Cranky Area (2)
		if (this.get_bit(bufData[0xca], 1)) count += 1; // Lighthouse Underwater (4)
		if (this.get_bit(bufData[0xca], 2)) count += 1; // Lighthouse Underwater (5)
		if (this.get_bit(bufData[0xca], 3)) count += 1; // Lighthouse Underwater (6)
		if (this.get_bit(bufData[0xca], 4)) count += 1; // Lighthouse Underwater (7)
		if (this.get_bit(bufData[0xca], 5)) count += 1; // Lighthouse Underwater (8)
		if (this.get_bit(bufData[0xca], 6)) count += 1; // Lighthouse Underwater (9)
		if (this.get_bit(bufData[0xca], 7)) count += 1; // Lighthouse Underwater (10)
		if (this.get_bit(bufData[0xcb], 0)) count += 1; // Cranky Area (3)
		if (this.get_bit(bufData[0xcb], 1)) count += 1; // Cranky Area (4)
		if (this.get_bit(bufData[0xcb], 2)) count += 1; // Cranky Area (5)
		if (this.get_bit(bufData[0xcb], 3)) count += 1; // Cranky Area (6)
		if (this.get_bit(bufData[0xcb], 4)) count += 1; // Cranky Area (7)
		if (this.get_bit(bufData[0xcb], 5)) count += 1; // Cranky Area (8)
		if (this.get_bit(bufData[0xcb], 6)) count += 1; // Cranky Area (9)
		if (this.get_bit(bufData[0xcb], 7)) count += 1; // Cranky Area (10)
		this.core.player.chunky.colored_bananas.gloomy_galleon = count - this.db.kong[4].tns_bananas.gloomy_galleon; // Subtract the bananas spent
	}

	// Fungi Forest Colored Bananas
	fuf_dk_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x56], 1)) count += 10; // Balloon Behind Barn
		if (this.get_bit(bufData[0x57], 0)) count += 10; // Balloon in Mill

		// Bunches
		if (this.get_bit(bufData[0xe1], 1)) count += 5; // Thorn Bunch
		if (this.get_bit(bufData[0xe1], 2)) count += 5; // High W5 Bunch
		if (this.get_bit(bufData[0xe1], 3)) count += 5; // Low W5 Bunch
		if (this.get_bit(bufData[0xf8], 0)) count += 5; // Cannon Bunch (1)
		if (this.get_bit(bufData[0xf8], 1)) count += 5; // Cannon Bunch (2)
		if (this.get_bit(bufData[0xf8], 2)) count += 5; // Cannon Bunch (3)
		if (this.get_bit(bufData[0xfa], 1)) count += 5; // Mill Bunch
		if (this.get_bit(bufData[0xfb], 4)) count += 5; // DK Barn Bunch
		if (this.get_bit(bufData[0x103], 0)) count += 5; // Baboon Blast (1)
		if (this.get_bit(bufData[0x103], 1)) count += 5; // Baboon Blast (2)

		// Single
		if (this.get_bit(bufData[0xdc], 0)) count += 1; // Blue Tunnel (1)
		if (this.get_bit(bufData[0xdc], 1)) count += 1; // Blue Tunnel (2)
		if (this.get_bit(bufData[0xdc], 2)) count += 1; // Blue Tunnel (3)
		if (this.get_bit(bufData[0xdc], 3)) count += 1; // Blue Tunnel (4)
		if (this.get_bit(bufData[0xdc], 4)) count += 1; // Blue Tunnel (5)
		if (this.get_bit(bufData[0xdc], 5)) count += 1; // Outside DK Barn (1)
		if (this.get_bit(bufData[0xdc], 6)) count += 1; // Outside DK Barn (2)
		if (this.get_bit(bufData[0xdc], 7)) count += 1; // Outside DK Barn (3)
		if (this.get_bit(bufData[0xdd], 3)) count += 1; // Pink Tunnel (1)
		if (this.get_bit(bufData[0xdd], 4)) count += 1; // Pink Tunnel (2)
		if (this.get_bit(bufData[0xdd], 5)) count += 1; // Pink Tunnel (3)
		if (this.get_bit(bufData[0xdd], 6)) count += 1; // Pink Tunnel (4)
		if (this.get_bit(bufData[0xdd], 7)) count += 1; // Pink Tunnel (5)
		if (this.get_bit(bufData[0xe1], 0)) count += 1; // Outside giant Mushroom (1)
		if (this.get_bit(bufData[0xe2], 0)) count += 1; // Outside Giant Mushroom (2)
		if (this.get_bit(bufData[0xe2], 1)) count += 1; // Outside Giant Mushroom (3)
		if (this.get_bit(bufData[0xe2], 2)) count += 1; // Outside Giant Mushroom (4)
		if (this.get_bit(bufData[0xe2], 3)) count += 1; // Outside Giant Mushroom (5)
		if (this.get_bit(bufData[0xe2], 4)) count += 1; // Outside Giant Mushroom (6)
		if (this.get_bit(bufData[0xe2], 5)) count += 1; // Outside Giant Mushroom (7)
		if (this.get_bit(bufData[0xe2], 6)) count += 1; // Outside Giant Mushroom (8)
		if (this.get_bit(bufData[0xe2], 7)) count += 1; // Outside Giant Mushroom (9)
		if (this.get_bit(bufData[0xe3], 0)) count += 1; // Outside DK barn (4)
		if (this.get_bit(bufData[0xe3], 1)) count += 1; // Outside DK barn (5)
		if (this.get_bit(bufData[0xe3], 2)) count += 1; // Outside Giant Mushroom (10)
		if (this.get_bit(bufData[0xe3], 3)) count += 1; // Outside Giant Mushroom (11)
		if (this.get_bit(bufData[0xe3], 4)) count += 1; // Outside Giant Mushroom (12)
		if (this.get_bit(bufData[0xe3], 5)) count += 1; // Outside Giant Mushroom (13)
		if (this.get_bit(bufData[0xe3], 6)) count += 1; // Outside Giant Mushroom (14)
		if (this.get_bit(bufData[0xe3], 7)) count += 1; // Outside Giant Mushroom (15)
		this.core.player.dk.colored_bananas.fungi_forest = count - this.db.kong[0].tns_bananas.fungi_forest; // Subtract the bananas spent
	}

	fuf_diddy_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x55], 6)) count += 10; // Snide's Balloon
		if (this.get_bit(bufData[0x56], 7)) count += 10; // Attic Balloon

		// Bunches
		if (this.get_bit(bufData[0xe4], 0)) count += 5; // Outside Barn Bunch
		if (this.get_bit(bufData[0xe4], 1)) count += 5; // W4 Bunch (1)
		if (this.get_bit(bufData[0xe4], 2)) count += 5; // W4 Bunch (2)
		if (this.get_bit(bufData[0xe4], 3)) count += 5; // Treetop Bunch
		if (this.get_bit(bufData[0xe5], 4)) count += 5; // Entrance Rocketbarrel Bunch (1)
		if (this.get_bit(bufData[0xe5], 5)) count += 5; // Entrance Rocketbarrel Bunch (2)
		if (this.get_bit(bufData[0xe5], 6)) count += 5; // Giant Mushroom Rocketbarrel Bunch (1)
		if (this.get_bit(bufData[0xe5], 7)) count += 5; // Giant Mushroom Rocketbarrel Bunch (2)
		if (this.get_bit(bufData[0xf4], 4)) count += 5; // Barn Bunch (1)
		if (this.get_bit(bufData[0xf4], 5)) count += 5; // Barn Bunch (2)

		// Single
		if (this.get_bit(bufData[0xe0], 5)) count += 1; // Top of Mushroom (1)
		if (this.get_bit(bufData[0xe0], 6)) count += 1; // Top of Mushroom (2)
		if (this.get_bit(bufData[0xe0], 7)) count += 1; // Top of Mushroom (3)
		if (this.get_bit(bufData[0xe5], 0)) count += 1; // Rabbit Race (1)
		if (this.get_bit(bufData[0xe6], 0)) count += 1; // Rabbit Race (2)
		if (this.get_bit(bufData[0xe6], 1)) count += 1; // Rabbit Race (3)
		if (this.get_bit(bufData[0xe6], 2)) count += 1; // Rabbit Race (4)
		if (this.get_bit(bufData[0xe6], 3)) count += 1; // Rabbit Race (5)
		if (this.get_bit(bufData[0xe6], 4)) count += 1; // Rabbit Race (6)
		if (this.get_bit(bufData[0xe6], 5)) count += 1; // Rabbit Race (7)
		if (this.get_bit(bufData[0xe6], 6)) count += 1; // Rabbit Race (8)
		if (this.get_bit(bufData[0xe6], 7)) count += 1; // Rabbit Race (9)
		if (this.get_bit(bufData[0xe7], 0)) count += 1; // Top of Mushroom (4)
		if (this.get_bit(bufData[0xe7], 1)) count += 1; // Top of Mushroom (5)
		if (this.get_bit(bufData[0xe7], 2)) count += 1; // Top of Mushroom (6)
		if (this.get_bit(bufData[0xe7], 3)) count += 1; // Top of Mushroom (7)
		if (this.get_bit(bufData[0xe7], 4)) count += 1; // Top of Mushroom (8)
		if (this.get_bit(bufData[0xe7], 5)) count += 1; // Top of Mushroom (9)
		if (this.get_bit(bufData[0xe7], 6)) count += 1; // Top of Mushroom (10)
		if (this.get_bit(bufData[0xe7], 7)) count += 1; // Rabbit Race (10)
		if (this.get_bit(bufData[0xef], 1)) count += 1; // Outside Barn (1)
		if (this.get_bit(bufData[0xef], 2)) count += 1; // Outside Barn (2)
		if (this.get_bit(bufData[0xef], 3)) count += 1; // Outside Barn (3)
		if (this.get_bit(bufData[0xf8], 3)) count += 1; // Near BP (1)
		if (this.get_bit(bufData[0xf8], 4)) count += 1; // Near BP (2)
		if (this.get_bit(bufData[0xf8], 5)) count += 1; // Near BP (3)
		if (this.get_bit(bufData[0xf8], 6)) count += 1; // Near BP (4)
		if (this.get_bit(bufData[0xf8], 7)) count += 1; // Near BP (5)
		if (this.get_bit(bufData[0xff], 0)) count += 1; // Near BP (6)
		if (this.get_bit(bufData[0xff], 1)) count += 1; // Near BP (7)
		this.core.player.diddy.colored_bananas.fungi_forest = count - this.db.kong[1].tns_bananas.fungi_forest; // Subtract the bananas spent
	}

	fuf_lanky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x57], 1)) count += 10; // Balloon in Upper Mushroom
		if (this.get_bit(bufData[0x57], 2)) count += 10; // Balloon in Lower Mushroom

		// Bunches
		if (this.get_bit(bufData[0xee], 0)) count += 5; // Rabbit Race Bunch
		if (this.get_bit(bufData[0xef], 4)) count += 5; // Baboon Balloon Bunch (1)
		if (this.get_bit(bufData[0xef], 5)) count += 5; // Baboon Balloon Bunch (2)
		if (this.get_bit(bufData[0xef], 6)) count += 5; // W1 Bunch
		if (this.get_bit(bufData[0xef], 7)) count += 5; // Top of Giant Mushroom Bunch
		if (this.get_bit(bufData[0xf7], 7)) count += 5; // W3 Bunch
		if (this.get_bit(bufData[0xf9], 7)) count += 5; // Colored Mushroom Puzzle Bunch
		if (this.get_bit(bufData[0xfb], 3)) count += 5; // Attic Bunch
		if (this.get_bit(bufData[0xfc], 5)) count += 5; // Bouncy Room Bunch (1)
		if (this.get_bit(bufData[0xfc], 6)) count += 5; // Bouncy Room Bunch (2)

		// Single
		if (this.get_bit(bufData[0xe5], 1)) count += 1; // Mill Roof (1)
		if (this.get_bit(bufData[0xe5], 2)) count += 1; // Rope (1)
		if (this.get_bit(bufData[0xe5], 3)) count += 1; // Rope (2)
		if (this.get_bit(bufData[0xe8], 0)) count += 1; // Around Giant Mushroom (1)
		if (this.get_bit(bufData[0xe8], 1)) count += 1; // Around Giant Mushroom (2)
		if (this.get_bit(bufData[0xe8], 2)) count += 1; // Rabbit Race (1)
		if (this.get_bit(bufData[0xe8], 3)) count += 1; // Rabbit Race (2)
		if (this.get_bit(bufData[0xe8], 4)) count += 1; // Rabbit Race (3)
		if (this.get_bit(bufData[0xe8], 5)) count += 1; // Mill Roof (2)
		if (this.get_bit(bufData[0xe8], 6)) count += 1; // Mill Roof (3)
		if (this.get_bit(bufData[0xe8], 7)) count += 1; // Mill Roof (4)
		if (this.get_bit(bufData[0xe9], 0)) count += 1; // Around Giant Mushroom (3)
		if (this.get_bit(bufData[0xe9], 1)) count += 1; // Around Giant Mushroom (4)
		if (this.get_bit(bufData[0xe9], 2)) count += 1; // Around Giant Mushroom (5)
		if (this.get_bit(bufData[0xe9], 3)) count += 1; // Around Giant Mushroom (6)
		if (this.get_bit(bufData[0xe9], 4)) count += 1; // Around Giant Mushroom (7)
		if (this.get_bit(bufData[0xe9], 5)) count += 1; // Around Giant Mushroom (8)
		if (this.get_bit(bufData[0xe9], 6)) count += 1; // Around Giant Mushroom (9)
		if (this.get_bit(bufData[0xe9], 7)) count += 1; // Around Giant Mushroom (10)
		if (this.get_bit(bufData[0xea], 0)) count += 1; // Gold Tunnel (1)
		if (this.get_bit(bufData[0xea], 1)) count += 1; // Gold Tunnel (2)
		if (this.get_bit(bufData[0xea], 2)) count += 1; // Gold Tunnel (3)
		if (this.get_bit(bufData[0xea], 3)) count += 1; // Gold Tunnel (4)
		if (this.get_bit(bufData[0xea], 4)) count += 1; // Gold Tunnel (5)
		if (this.get_bit(bufData[0xea], 5)) count += 1; // Gold Tunnel (6)
		if (this.get_bit(bufData[0xea], 6)) count += 1; // Gold Tunnel (7)
		if (this.get_bit(bufData[0xea], 7)) count += 1; // Gold Tunnel (8)
		if (this.get_bit(bufData[0xeb], 6)) count += 1; // Gold Tunnel (9)
		if (this.get_bit(bufData[0xeb], 7)) count += 1; // Gold Tunnel (10)
		if (this.get_bit(bufData[0xef], 0)) count += 1; // Rope (3)
		this.core.player.lanky.colored_bananas.fungi_forest = count - this.db.kong[2].tns_bananas.fungi_forest; // Subtract the bananas spent
	}

	fuf_tiny_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x56], 0)) count += 10; // Kasplat Balloon
		if (this.get_bit(bufData[0x56], 4)) count += 10; // Behind DK Barn

		// Bunches
		if (this.get_bit(bufData[0xf1], 3)) count += 5; // Beanstalk Bunch (1)
		if (this.get_bit(bufData[0xf1], 4)) count += 5; // W3 Bunch
		if (this.get_bit(bufData[0xf1], 5)) count += 5; // Anthill Bunch
		if (this.get_bit(bufData[0xf1], 6)) count += 5; // Beanstalk Bunch (2)
		if (this.get_bit(bufData[0xf1], 7)) count += 5; // Beanstalk Bunch (3)
		if (this.get_bit(bufData[0xf9], 0)) count += 5; // Mill Bunch (1)
		if (this.get_bit(bufData[0xf9], 1)) count += 5; // Mill Bunch (2)
		if (this.get_bit(bufData[0xf9], 2)) count += 5; // Mill Bunch (3)
		if (this.get_bit(bufData[0xfa], 0)) count += 5; // Spider Boss Bunch
		if (this.get_bit(bufData[0xff], 2)) count += 5; // Bunch Inside Mushroom

		// Single
		if (this.get_bit(bufData[0xec], 0)) count += 1; // Green Tunnel (1)
		if (this.get_bit(bufData[0xec], 1)) count += 1; // Green Tunnel (2)
		if (this.get_bit(bufData[0xec], 2)) count += 1; // River (1)
		if (this.get_bit(bufData[0xec], 3)) count += 1; // River (2)
		if (this.get_bit(bufData[0xec], 4)) count += 1; // River (3)
		if (this.get_bit(bufData[0xec], 5)) count += 1; // River (4)
		if (this.get_bit(bufData[0xec], 6)) count += 1; // River (5)
		if (this.get_bit(bufData[0xec], 7)) count += 1; // River (6)
		if (this.get_bit(bufData[0xed], 5)) count += 1; // Green Tunnel (3)
		if (this.get_bit(bufData[0xed], 6)) count += 1; // Green Tunnel (4)
		if (this.get_bit(bufData[0xed], 7)) count += 1; // Green Tunnel (5)
		if (this.get_bit(bufData[0xf1], 0)) count += 1; // Outside Anthill (1)
		if (this.get_bit(bufData[0xf1], 1)) count += 1; // Outside Anthill (2)
		if (this.get_bit(bufData[0xf1], 2)) count += 1; // Outside Anthill (3)
		if (this.get_bit(bufData[0xf2], 0)) count += 1; // River (7)
		if (this.get_bit(bufData[0xf2], 1)) count += 1; // River (8)
		if (this.get_bit(bufData[0xf2], 2)) count += 1; // River (9)
		if (this.get_bit(bufData[0xf2], 3)) count += 1; // Outside Anthill (4)
		if (this.get_bit(bufData[0xf2], 4)) count += 1; // Outside Anthill (5)
		if (this.get_bit(bufData[0xf2], 5)) count += 1; // Outside Anthill (6)
		if (this.get_bit(bufData[0xf2], 6)) count += 1; // Outside Anthill (7)
		if (this.get_bit(bufData[0xf2], 7)) count += 1; // Outside Anthill (8)
		if (this.get_bit(bufData[0xf3], 0)) count += 1; // River (10)
		if (this.get_bit(bufData[0xf3], 1)) count += 1; // River (11)
		if (this.get_bit(bufData[0xf3], 2)) count += 1; // River (12)
		if (this.get_bit(bufData[0xf3], 3)) count += 1; // River (13)
		if (this.get_bit(bufData[0xf3], 4)) count += 1; // River (14)
		if (this.get_bit(bufData[0xf3], 5)) count += 1; // River (15)
		if (this.get_bit(bufData[0xf3], 6)) count += 1; // River (16)
		if (this.get_bit(bufData[0xf3], 7)) count += 1; // River (17)
		this.core.player.tiny.colored_bananas.fungi_forest = count - this.db.kong[3].tns_bananas.fungi_forest; // Subtract the bananas spent
	}

	fuf_chunky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x56], 3)) count += 10; // Kasplat Balloon
		if (this.get_bit(bufData[0x57], 3)) count += 10; // Face Game Balloon

		// Bunches
		if (this.get_bit(bufData[0xf6], 2)) count += 5; // W2 Bunch (1)
		if (this.get_bit(bufData[0xf6], 3)) count += 5; // W2 Bunch (2)
		if (this.get_bit(bufData[0xf6], 4)) count += 5; // Well Bunch
		if (this.get_bit(bufData[0xf9], 3)) count += 5; // Mill Bunch
		if (this.get_bit(bufData[0xfc], 0)) count += 5; // Giant Mushroom Bunch (1)
		if (this.get_bit(bufData[0xfc], 1)) count += 5; // Giant Mushroom Bunch (2)
		if (this.get_bit(bufData[0xfc], 2)) count += 5; // Giant Mushroom Bunch (3)
		if (this.get_bit(bufData[0xfc], 3)) count += 5; // Giant Mushroom Bunch (4)
		if (this.get_bit(bufData[0xfc], 4)) count += 5; // Giant Mushroom Bunch (5)
		if (this.get_bit(bufData[0xfc], 7)) count += 5; // Face Game Bunch

		// Single
		if (this.get_bit(bufData[0xf6], 0)) count += 1; // Apple (1)
		if (this.get_bit(bufData[0xf6], 1)) count += 1; // Apple (2)
		if (this.get_bit(bufData[0xf7], 0)) count += 1; // Apple (3)
		if (this.get_bit(bufData[0xf7], 1)) count += 1; // Apple (4)
		if (this.get_bit(bufData[0xf7], 2)) count += 1; // Apple (5)
		if (this.get_bit(bufData[0xf7], 3)) count += 1; // Apple (6)
		if (this.get_bit(bufData[0xf7], 4)) count += 1; // Apple (7)
		if (this.get_bit(bufData[0xf7], 5)) count += 1; // Apple (8)
		if (this.get_bit(bufData[0xf7], 6)) count += 1; // Apple (9)
		if (this.get_bit(bufData[0xfd], 0)) count += 1; // Inside Mushroom (7)
		if (this.get_bit(bufData[0xfd], 1)) count += 1; // Inside Mushroom (8)
		if (this.get_bit(bufData[0xfd], 2)) count += 1; // Inside Mushroom (9)
		if (this.get_bit(bufData[0xfd], 3)) count += 1; // Inside Mushroom (10)
		if (this.get_bit(bufData[0xfd], 4)) count += 1; // Inside Mushroom (11)
		if (this.get_bit(bufData[0xfd], 5)) count += 1; // Inside Mushroom (12)
		if (this.get_bit(bufData[0xfd], 6)) count += 1; // Inside Mushroom (13)
		if (this.get_bit(bufData[0xfd], 7)) count += 1; // Inside Mushroom (14)
		if (this.get_bit(bufData[0xfe], 0)) count += 1; // Inside Mushroom (1)
		if (this.get_bit(bufData[0xfe], 1)) count += 1; // Inside Mushroom (15)
		if (this.get_bit(bufData[0xfe], 2)) count += 1; // Inside Mushroom (16)
		if (this.get_bit(bufData[0xfe], 3)) count += 1; // Inside Mushroom (17)
		if (this.get_bit(bufData[0xfe], 4)) count += 1; // Inside Mushroom (18)
		if (this.get_bit(bufData[0xfe], 5)) count += 1; // Inside Mushroom (19)
		if (this.get_bit(bufData[0xfe], 6)) count += 1; // Inside Mushroom (20)
		if (this.get_bit(bufData[0xfe], 7)) count += 1; // Inside Mushroom (21)
		if (this.get_bit(bufData[0xff], 3)) count += 1; // Inside Mushroom (2)
		if (this.get_bit(bufData[0xff], 4)) count += 1; // Inside Mushroom (3)
		if (this.get_bit(bufData[0xff], 5)) count += 1; // Inside Mushroom (4)
		if (this.get_bit(bufData[0xff], 6)) count += 1; // Inside Mushroom (5)
		if (this.get_bit(bufData[0xff], 7)) count += 1; // Inside Mushroom (6)
		this.core.player.chunky.colored_bananas.fungi_forest = count - this.db.kong[4].tns_bananas.fungi_forest; // Subtract the bananas spent
	}

	// Crystal Caves Colored Bananas
	cryc_dk_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x58], 1)) count += 10; // Entrance Ice Wall Balloon
		if (this.get_bit(bufData[0x58], 5)) count += 10; // Giant Rock Balloon
		if (this.get_bit(bufData[0x59], 0)) count += 10; // 5DI Balloon

		// Bunches
		if (this.get_bit(bufData[0x101], 2)) count += 5; // W1 Entrance
		if (this.get_bit(bufData[0x101], 3)) count += 5; // W1 5DI
		if (this.get_bit(bufData[0x101], 4)) count += 5; // 5DC Bongo Pad
		if (this.get_bit(bufData[0x114], 2)) count += 5; // Baboon Blast (1)
		if (this.get_bit(bufData[0x114], 4)) count += 5; // Baboon Blast (2)
		if (this.get_bit(bufData[0x114], 5)) count += 5; // Baboon Blast (3)
		if (this.get_bit(bufData[0x114], 6)) count += 5; // Baboon Blast (4)
		if (this.get_bit(bufData[0x116], 0)) count += 5; // DK Cabin (1)
		if (this.get_bit(bufData[0x117], 2)) count += 5; // 5DI Bunch
		if (this.get_bit(bufData[0x117], 3)) count += 5; // Rotating Room

		// Single
		if (this.get_bit(bufData[0x101], 0)) count += 1; // Near Baboon Blast (1)
		if (this.get_bit(bufData[0x101], 1)) count += 1; // Near Baboon Blast (2)
		if (this.get_bit(bufData[0x102], 0)) count += 1; // Around 5DI (1)
		if (this.get_bit(bufData[0x102], 1)) count += 1; // Around 5DI (2)
		if (this.get_bit(bufData[0x102], 2)) count += 1; // Around 5DI (3)
		if (this.get_bit(bufData[0x102], 3)) count += 1; // Around 5DI (4)
		if (this.get_bit(bufData[0x102], 4)) count += 1; // Around 5DI (5)
		if (this.get_bit(bufData[0x102], 5)) count += 1; // Near Baboon Blast (3)
		if (this.get_bit(bufData[0x102], 6)) count += 1; // Near Baboon Blast (4)
		if (this.get_bit(bufData[0x102], 7)) count += 1; // Near Baboon Blast (5)
		if (this.get_bit(bufData[0x10a], 1)) count += 1; // T&S Igloo (1)
		if (this.get_bit(bufData[0x10a], 2)) count += 1; // T&S Igloo (2)
		if (this.get_bit(bufData[0x10a], 3)) count += 1; // T&S Igloo (3)
		if (this.get_bit(bufData[0x110], 3)) count += 1; // 5DI (1)
		if (this.get_bit(bufData[0x110], 4)) count += 1; // 5DI (2)
		if (this.get_bit(bufData[0x110], 5)) count += 1; // 5DI (3)
		if (this.get_bit(bufData[0x110], 6)) count += 1; // 5DI (4)
		if (this.get_bit(bufData[0x110], 7)) count += 1; // 5DI (5)
		if (this.get_bit(bufData[0x117], 0)) count += 1; // 5DI (6)
		if (this.get_bit(bufData[0x117], 1)) count += 1; // 5DI (7)
		this.core.player.dk.colored_bananas.crystal_caves = count - this.db.kong[0].tns_bananas.crystal_caves; // Subtract the bananas spent
	}

	cryc_diddy_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x57], 4)) count += 10; // W4 Balloon
		if (this.get_bit(bufData[0x58], 2)) count += 10; // Outside 5DC Balloon
		if (this.get_bit(bufData[0x5a], 0)) count += 10; // 5DI Balloon

		// Bunches
		if (this.get_bit(bufData[0x100], 3)) count += 5; // Around 5DI (1)
		if (this.get_bit(bufData[0x103], 2)) count += 5; // Around 5DI (2)
		if (this.get_bit(bufData[0x103], 4)) count += 5; // Funky Bunch
		if (this.get_bit(bufData[0x106], 1)) count += 5; // Bunch on W4 (far)
		if (this.get_bit(bufData[0x106], 2)) count += 5; // W4 Bunch
		if (this.get_bit(bufData[0x106], 3)) count += 5; // Tiny Igloo Bunch
		if (this.get_bit(bufData[0x106], 4)) count += 5; // Chunky Igloo Bunch
		if (this.get_bit(bufData[0x115], 0)) count += 5; // Lower 5DC
		if (this.get_bit(bufData[0x11b], 1)) count += 5; // 5DC Bunch (1)
		if (this.get_bit(bufData[0x11b], 2)) count += 5; // 5DC Bunch (2)
		if (this.get_bit(bufData[0x11b], 3)) count += 5; // 5DC Bunch (3)

		// Single
		if (this.get_bit(bufData[0x105], 5)) count += 1; // W4 Kasplat (1)
		if (this.get_bit(bufData[0x107], 4)) count += 1; // Funky (1)
		if (this.get_bit(bufData[0x107], 5)) count += 1; // Funky (2)
		if (this.get_bit(bufData[0x107], 6)) count += 1; // Funky (3)
		if (this.get_bit(bufData[0x107], 7)) count += 1; // Funky (4)
		if (this.get_bit(bufData[0x108], 1)) count += 1; // W4 Kasplat (2)
		if (this.get_bit(bufData[0x108], 2)) count += 1; // W4 Kasplat (3)
		if (this.get_bit(bufData[0x108], 3)) count += 1; // W4 Kasplat (4)
		if (this.get_bit(bufData[0x108], 4)) count += 1; // Funky (5)
		if (this.get_bit(bufData[0x108], 5)) count += 1; // W4 Kasplat (5)
		if (this.get_bit(bufData[0x116], 3)) count += 1; // Lower 5DC (1)
		if (this.get_bit(bufData[0x116], 4)) count += 1; // Lower 5DC (2)
		if (this.get_bit(bufData[0x116], 5)) count += 1; // Lower 5DC (3)
		if (this.get_bit(bufData[0x116], 6)) count += 1; // Lower 5DC (4)
		if (this.get_bit(bufData[0x116], 7)) count += 1; // Lower 5DC (5)
		this.core.player.diddy.colored_bananas.crystal_caves = count - this.db.kong[1].tns_bananas.crystal_caves; // Subtract the bananas spent
	}

	cryc_lanky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x58], 0)) count += 10; // Outside Cabin Balloon
		if (this.get_bit(bufData[0x58], 7)) count += 10; // 5DI Balloon
		if (this.get_bit(bufData[0x59], 7)) count += 10; // Ice Tomato Balloon

		// Bunches
		if (this.get_bit(bufData[0x100], 4)) count += 5; // Cranky Bunch (1)
		if (this.get_bit(bufData[0x100], 5)) count += 5; // Lanky Castle
		if (this.get_bit(bufData[0x100], 6)) count += 5; // Lanky Cabin Instrument Pad
		if (this.get_bit(bufData[0x10e], 0)) count += 5; // Cranky Bunch (2)
		if (this.get_bit(bufData[0x10e], 1)) count += 5; // Cranky Bunch (3)
		if (this.get_bit(bufData[0x10e], 2)) count += 5; // W5 Bunch (1)
		if (this.get_bit(bufData[0x10e], 3)) count += 5; // W5 Bunch (2)
		if (this.get_bit(bufData[0x10e], 4)) count += 5; // W5 Bunch (3)
		if (this.get_bit(bufData[0x10e], 5)) count += 5; // W5 Bunch (4)
		if (this.get_bit(bufData[0x115], 7)) count += 5; // Lanky Cabin

		// Single
		if (this.get_bit(bufData[0x105], 4)) count += 1; // Entrance (1)
		if (this.get_bit(bufData[0x107], 0)) count += 1; // Entrance (2)
		if (this.get_bit(bufData[0x107], 1)) count += 1; // Entrance (3)
		if (this.get_bit(bufData[0x107], 2)) count += 1; // Entrance (4)
		if (this.get_bit(bufData[0x107], 3)) count += 1; // Entrance (5)
		if (this.get_bit(bufData[0x108], 6)) count += 1; // River to 5DC (1)
		if (this.get_bit(bufData[0x108], 7)) count += 1; // River to 5DC (2)
		if (this.get_bit(bufData[0x10f], 0)) count += 1; // River to 5DC (3)
		if (this.get_bit(bufData[0x10f], 1)) count += 1; // River to 5DC (4)
		if (this.get_bit(bufData[0x10f], 2)) count += 1; // River to 5DC (5)
		if (this.get_bit(bufData[0x10f], 3)) count += 1; // River to 5DC (6)
		if (this.get_bit(bufData[0x10f], 4)) count += 1; // River to 5DC (7)
		if (this.get_bit(bufData[0x10f], 5)) count += 1; // River to 5DC (8)
		if (this.get_bit(bufData[0x10f], 6)) count += 1; // River to 5DC (9)
		if (this.get_bit(bufData[0x10f], 7)) count += 1; // River to 5DC (10)
		if (this.get_bit(bufData[0x110], 0)) count += 1; // 5DI (1)
		if (this.get_bit(bufData[0x110], 1)) count += 1; // 5DI (2)
		if (this.get_bit(bufData[0x110], 2)) count += 1; // 5DI (3)
		if (this.get_bit(bufData[0x111], 6)) count += 1; // 5DI (4)
		if (this.get_bit(bufData[0x111], 7)) count += 1; // 5DI (5)
		this.core.player.lanky.colored_bananas.crystal_caves = count - this.db.kong[2].tns_bananas.crystal_caves; // Subtract the bananas spent
	}

	cryc_tiny_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x57], 6)) count += 10; // Candy Balloon
		if (this.get_bit(bufData[0x58], 4)) count += 10; // W2 Kasplat Balloon
		if (this.get_bit(bufData[0x58], 6)) count += 10; // 5DI Balloon
		if (this.get_bit(bufData[0x59], 4)) count += 10; // 5DC Balloon

		// Bunches
		if (this.get_bit(bufData[0x10a], 7)) count += 5; // W3 Mini Monkey
		if (this.get_bit(bufData[0x111], 1)) count += 5; // Giant Kosha (1)
		if (this.get_bit(bufData[0x111], 2)) count += 5; // Giant Kosha (2)
		if (this.get_bit(bufData[0x111], 3)) count += 5; // Giant Kosha (3)
		if (this.get_bit(bufData[0x111], 4)) count += 5; // Giant Kosha (4)
		if (this.get_bit(bufData[0x111], 5)) count += 5; // 5DI
		if (this.get_bit(bufData[0x113], 1)) count += 5; // Monkeyport Igloo
		if (this.get_bit(bufData[0x113], 3)) count += 5; // W3
		if (this.get_bit(bufData[0x115], 5)) count += 5; // 5DC (1)
		if (this.get_bit(bufData[0x115], 6)) count += 5; // 5DC (2)

		// Single
		if (this.get_bit(bufData[0x10c], 0)) count += 1; // River to 5DI (1)
		if (this.get_bit(bufData[0x10c], 1)) count += 1; // River to 5DI (2)
		if (this.get_bit(bufData[0x10c], 2)) count += 1; // River to 5DI (3)
		if (this.get_bit(bufData[0x10c], 3)) count += 1; // River to 5DI (4)
		if (this.get_bit(bufData[0x10c], 4)) count += 1; // River to 5DI (5)
		if (this.get_bit(bufData[0x10c], 5)) count += 1; // River to 5DI (6)
		if (this.get_bit(bufData[0x10c], 6)) count += 1; // River to 5DI (7)
		if (this.get_bit(bufData[0x10c], 7)) count += 1; // River to 5DI (8)
		if (this.get_bit(bufData[0x10d], 7)) count += 1; // River to 5DI (9)
		if (this.get_bit(bufData[0x113], 0)) count += 1; // River to 5DI (10)
		this.core.player.tiny.colored_bananas.crystal_caves = count - this.db.kong[3].tns_bananas.crystal_caves; // Subtract the bananas spent
	}

	cryc_chunky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x57], 5)) count += 10; // Snide Balloon
		if (this.get_bit(bufData[0x58], 3)) count += 10; // W3 Balloon
		if (this.get_bit(bufData[0x59], 5)) count += 10; // 5DI Balloon

		// Bunches
		if (this.get_bit(bufData[0x103], 5)) count += 5; // W2 Bunch (1)
		if (this.get_bit(bufData[0x103], 6)) count += 5; // W2 Bunch (2)
		if (this.get_bit(bufData[0x10a], 4)) count += 5; // Entrance Ice Wall
		if (this.get_bit(bufData[0x10a], 5)) count += 5; // Bunch on rock Switch
		if (this.get_bit(bufData[0x10a], 6)) count += 5; // Bunch under Big Rock
		if (this.get_bit(bufData[0x113], 4)) count += 5; // Bunch under rock
		if (this.get_bit(bufData[0x117], 4)) count += 5; // 5DC Bunch (1)
		if (this.get_bit(bufData[0x117], 5)) count += 5; // 5DC Bunch (2)
		if (this.get_bit(bufData[0x117], 6)) count += 5; // 5DC Bunch (3)
		if (this.get_bit(bufData[0x117], 7)) count += 5; // 5DC Bunch (4)

		// Single
		if (this.get_bit(bufData[0x103], 7)) count += 1; // T&S Igloo (1)
		if (this.get_bit(bufData[0x104], 0)) count += 1; // Entrance Ice Wall (1)
		if (this.get_bit(bufData[0x104], 1)) count += 1; // Wooden plank (1)
		if (this.get_bit(bufData[0x104], 2)) count += 1; // Wooden plank (2)
		if (this.get_bit(bufData[0x104], 3)) count += 1; // Wooden plank (3)
		if (this.get_bit(bufData[0x104], 4)) count += 1; // Snide (1)
		if (this.get_bit(bufData[0x104], 5)) count += 1; // Snide (2)
		if (this.get_bit(bufData[0x104], 6)) count += 1; // Snide (3)
		if (this.get_bit(bufData[0x104], 7)) count += 1; // Chunky Igloo (1)
		if (this.get_bit(bufData[0x105], 6)) count += 1; // Entrance Ice Wall (2)
		if (this.get_bit(bufData[0x105], 7)) count += 1; // Entrance Ice Wall (3)
		if (this.get_bit(bufData[0x10a], 0)) count += 1; // T&S Igloo (2)
		if (this.get_bit(bufData[0x10b], 0)) count += 1; // Chunky Igloo (2)
		if (this.get_bit(bufData[0x10b], 1)) count += 1; // Chunky Igloo (3)
		if (this.get_bit(bufData[0x10b], 2)) count += 1; // Chunky Igloo (4)
		if (this.get_bit(bufData[0x10b], 3)) count += 1; // Chunky Igloo (5)
		if (this.get_bit(bufData[0x10b], 4)) count += 1; // T&S Igloo (3)
		if (this.get_bit(bufData[0x10b], 5)) count += 1; // T&S Igloo (4)
		if (this.get_bit(bufData[0x10b], 6)) count += 1; // T&S Igloo (5)
		if (this.get_bit(bufData[0x10b], 7)) count += 1; // T&S Igloo (6)
		this.core.player.chunky.colored_bananas.crystal_caves = count - this.db.kong[4].tns_bananas.crystal_caves; // Subtract the bananas spent
	}

	// Creepy Castle Colored Bananas
	crec_dk_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x5a], 4)) count += 10; // Crypt Balloon
		if (this.get_bit(bufData[0x5b], 4)) count += 10; // Tree Balloon

		// Bunches
		if (this.get_bit(bufData[0x128], 5)) count += 5; // Library Bunch (1)
		if (this.get_bit(bufData[0x128], 6)) count += 5; // Library Bunch (2)
		if (this.get_bit(bufData[0x128], 7)) count += 5; // Library Bunch (3)
		if (this.get_bit(bufData[0x12a], 4)) count += 5; // Crypt Bunch
		if (this.get_bit(bufData[0x130], 1)) count += 5; // Tree Bunch
		if (this.get_bit(bufData[0x133], 7)) count += 5; // Dungeon Bunch

		// Single
		if (this.get_bit(bufData[0x118], 0)) count += 1; // Lower Path from Tunnel (1)
		if (this.get_bit(bufData[0x118], 1)) count += 1; // Lower Path from Tunnel (2)
		if (this.get_bit(bufData[0x118], 2)) count += 1; // Lower Path from Tunnel (3)
		if (this.get_bit(bufData[0x118], 3)) count += 1; // Lower Path from Tunnel (4)
		if (this.get_bit(bufData[0x118], 4)) count += 1; // Lower Path from Tunnel (5)
		if (this.get_bit(bufData[0x118], 5)) count += 1; // Lower Path from Tunnel (6)
		if (this.get_bit(bufData[0x118], 6)) count += 1; // Lower Ladder
		if (this.get_bit(bufData[0x118], 7)) count += 1; // Lower Path from Tunnel (7)
		if (this.get_bit(bufData[0x119], 0)) count += 1; // Road to W1 (1)
		if (this.get_bit(bufData[0x119], 1)) count += 1; // Road to W1 (2)
		if (this.get_bit(bufData[0x119], 2)) count += 1; // Road to W1 (3)
		if (this.get_bit(bufData[0x119], 3)) count += 1; // Road to W1 (4)
		if (this.get_bit(bufData[0x119], 4)) count += 1; // Road to W1 (5)
		if (this.get_bit(bufData[0x119], 5)) count += 1; // Road to W1 (6)
		if (this.get_bit(bufData[0x119], 6)) count += 1; // Road to W1 (7)
		if (this.get_bit(bufData[0x119], 7)) count += 1; // Road to W1 (8)
		if (this.get_bit(bufData[0x11a], 0)) count += 1; // Bridge (1)
		if (this.get_bit(bufData[0x11a], 1)) count += 1; // Road to W1 (9)
		if (this.get_bit(bufData[0x11a], 2)) count += 1; // Road to W1 (10)
		if (this.get_bit(bufData[0x11a], 3)) count += 1; // Road to W1 (11)
		if (this.get_bit(bufData[0x11a], 4)) count += 1; // Road to W1 (12)
		if (this.get_bit(bufData[0x11a], 5)) count += 1; // Road to W1 (13)
		if (this.get_bit(bufData[0x11a], 6)) count += 1; // Road to W1 (14)
		if (this.get_bit(bufData[0x11a], 7)) count += 1; // Road to W1 (15)
		if (this.get_bit(bufData[0x11b], 4)) count += 1; // Bridge (2)
		if (this.get_bit(bufData[0x11b], 5)) count += 1; // Bridge (3)
		if (this.get_bit(bufData[0x11b], 6)) count += 1; // Bridge (4)
		if (this.get_bit(bufData[0x11b], 7)) count += 1; // Bridge (5)
		if (this.get_bit(bufData[0x11d], 0)) count += 1; // Upper Path to W2 (1)
		if (this.get_bit(bufData[0x11d], 1)) count += 1; // Upper Path to W2 (2)
		if (this.get_bit(bufData[0x11d], 2)) count += 1; // Upper Path to W2 (3)
		if (this.get_bit(bufData[0x11d], 3)) count += 1; // Upper Path to W2 (4)
		if (this.get_bit(bufData[0x11d], 4)) count += 1; // Lower Path from Tunnel (8)
		if (this.get_bit(bufData[0x11d], 5)) count += 1; // Upper Path to W2 (5)
		if (this.get_bit(bufData[0x11e], 0)) count += 1; // Upper Path to W2 (6)
		if (this.get_bit(bufData[0x11e], 1)) count += 1; // Upper Path to W2 (7)
		if (this.get_bit(bufData[0x11e], 2)) count += 1; // Upper Path to W2 (8)
		if (this.get_bit(bufData[0x11e], 3)) count += 1; // Upper Path to W2 (9)
		if (this.get_bit(bufData[0x11e], 4)) count += 1; // Upper Path to W2 (10)
		if (this.get_bit(bufData[0x11e], 5)) count += 1; // Upper Path to W2 (11)
		if (this.get_bit(bufData[0x11e], 6)) count += 1; // Upper Path to W2 (12)
		if (this.get_bit(bufData[0x11e], 7)) count += 1; // Upper Path to W2 (13)
		if (this.get_bit(bufData[0x11f], 0)) count += 1; // Upper Path to W2 (14)
		if (this.get_bit(bufData[0x11f], 1)) count += 1; // Upper Path to W2 (15)
		if (this.get_bit(bufData[0x11f], 2)) count += 1; // Upper Path to W2 (16)
		if (this.get_bit(bufData[0x11f], 3)) count += 1; // Upper Path to W2 (17)
		if (this.get_bit(bufData[0x11f], 4)) count += 1; // Upper Path to W2 (18)
		if (this.get_bit(bufData[0x11f], 5)) count += 1; // Upper Path to W2 (19)
		if (this.get_bit(bufData[0x11f], 6)) count += 1; // Upper Path to W2 (20)
		if (this.get_bit(bufData[0x11f], 7)) count += 1; // Upper Path to W2 (21)
		this.core.player.dk.colored_bananas.creepy_castle = count - this.db.kong[0].tns_bananas.creepy_castle; // Subtract the bananas spent
	}

	crec_diddy_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x59], 2)) count += 10; // W1 Balloon
		if (this.get_bit(bufData[0x59], 3)) count += 10; // Ballroom Balloon
		if (this.get_bit(bufData[0x5a], 3)) count += 10; // Coffin Balloon
		if (this.get_bit(bufData[0x5a], 7)) count += 10; // Chain Room Balloon
		if (this.get_bit(bufData[0x5c], 1)) count += 10; // Crypt Balloon

		// Bunches
		if (this.get_bit(bufData[0x124], 0)) count += 5; // Big Bug Bash Bunch
		if (this.get_bit(bufData[0x124], 4)) count += 5; // Cranky Bunch
		if (this.get_bit(bufData[0x129], 2)) count += 5; // Crypt Bunch
		if (this.get_bit(bufData[0x12b], 3)) count += 5; // Ballroom Bunch (1)
		if (this.get_bit(bufData[0x12b], 4)) count += 5; // Ballroom Bunch (2)
		if (this.get_bit(bufData[0x12b], 5)) count += 5; // Ballroom Bunch (3)
		if (this.get_bit(bufData[0x131], 2)) count += 5; // Dungeon Bunch (1)
		if (this.get_bit(bufData[0x131], 3)) count += 5; // Dungeon Bunch (2)
		if (this.get_bit(bufData[0x131], 4)) count += 5; // Dungeon Bunch (3)
		if (this.get_bit(bufData[0x131], 5)) count += 5; // Dungeon Bunch (4)
		this.core.player.diddy.colored_bananas.creepy_castle = count - this.db.kong[1].tns_bananas.creepy_castle; // Subtract the bananas spent
	}

	crec_lanky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x5a], 1)) count += 10; // Lanky Tower Balloon
		if (this.get_bit(bufData[0x5a], 2)) count += 10; // Crypt Balloon
		if (this.get_bit(bufData[0x5b], 0)) count += 10; // Dungeon Balloon (1)
		if (this.get_bit(bufData[0x5b], 2)) count += 10; // Dungeon Balloon (2)

		// Bunches
		if (this.get_bit(bufData[0x135], 1)) count += 5; // Crypt Bunch (1)
		if (this.get_bit(bufData[0x135], 3)) count += 5; // Crypt Bunch (2)
		if (this.get_bit(bufData[0x135], 4)) count += 5; // Crypt Bunch (3)
		if (this.get_bit(bufData[0x136], 5)) count += 5; // Crypt Bunch (4)
		if (this.get_bit(bufData[0x136], 7)) count += 5; // Crypt Bunch (5)
		if (this.get_bit(bufData[0x137], 2)) count += 5; // Greenhouse Bunch (1)
		if (this.get_bit(bufData[0x137], 3)) count += 5; // Greenhouse Bunch (2)
		if (this.get_bit(bufData[0x137], 4)) count += 5; // Greenhouse Bunch (3)
		if (this.get_bit(bufData[0x137], 5)) count += 5; // Greenhouse Bunch (4)
		if (this.get_bit(bufData[0x137], 6)) count += 5; // Greenhouse Bunch (5)
		if (this.get_bit(bufData[0x137], 7)) count += 5; // Greenhouse Bunch (6)

		// Single
		if (this.get_bit(bufData[0x135], 0)) count += 1; // Crypt (1)
		if (this.get_bit(bufData[0x135], 2)) count += 1; // Crypt (2)
		if (this.get_bit(bufData[0x136], 3)) count += 1; // Crypt (3)
		if (this.get_bit(bufData[0x136], 4)) count += 1; // Crypt (4)
		if (this.get_bit(bufData[0x136], 6)) count += 1; // Crypt (5)
		this.core.player.lanky.colored_bananas.creepy_castle = count - this.db.kong[2].tns_bananas.creepy_castle; // Subtract the bananas spent
	}

	crec_tiny_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x5a], 5)) count += 10; // Museum Display Balloon
		if (this.get_bit(bufData[0x5c], 2)) count += 10; // Funky Balloon

		// Bunches
		if (this.get_bit(bufData[0x124], 7)) count += 5; // Ballroom Bunch
		if (this.get_bit(bufData[0x127], 3)) count += 5; // W5 Bunch
		if (this.get_bit(bufData[0x128], 0)) count += 5; // Museum Display Bunch
		if (this.get_bit(bufData[0x129], 6)) count += 5; // Car Race Bunch (1)
		if (this.get_bit(bufData[0x129], 7)) count += 5; // Car Race Bunch (2)
		if (this.get_bit(bufData[0x12b], 6)) count += 5; // Crypt Bunch
		if (this.get_bit(bufData[0x130], 7)) count += 5; // Trashcan Bunch

		// Single
		if (this.get_bit(bufData[0x11c], 0)) count += 1; // Path (1)
		if (this.get_bit(bufData[0x11c], 1)) count += 1; // Path (2)
		if (this.get_bit(bufData[0x11c], 2)) count += 1; // Path (3)
		if (this.get_bit(bufData[0x11c], 3)) count += 1; // Path (4)
		if (this.get_bit(bufData[0x11c], 4)) count += 1; // Path (5)
		if (this.get_bit(bufData[0x11c], 5)) count += 1; // Path (6)
		if (this.get_bit(bufData[0x11c], 6)) count += 1; // Path (7)
		if (this.get_bit(bufData[0x11c], 7)) count += 1; // Path (8)
		if (this.get_bit(bufData[0x11d], 6)) count += 1; // Path (9)
		if (this.get_bit(bufData[0x11d], 7)) count += 1; // Path (10)
		if (this.get_bit(bufData[0x120], 0)) count += 1; // Path to W5 (1)
		if (this.get_bit(bufData[0x120], 1)) count += 1; // Path to W5 (2)
		if (this.get_bit(bufData[0x120], 2)) count += 1; // Path to W5 (3)
		if (this.get_bit(bufData[0x120], 3)) count += 1; // Path to W5 (4)
		if (this.get_bit(bufData[0x120], 4)) count += 1; // Path to W5 (5)
		if (this.get_bit(bufData[0x120], 5)) count += 1; // Path to W5 (6)
		if (this.get_bit(bufData[0x120], 6)) count += 1; // Path to W5 (7)
		if (this.get_bit(bufData[0x120], 7)) count += 1; // Path to W5 (8)
		if (this.get_bit(bufData[0x121], 0)) count += 1; // Path to W5 (9)
		if (this.get_bit(bufData[0x121], 1)) count += 1; // Path to W5 (10)
		if (this.get_bit(bufData[0x121], 2)) count += 1; // Path to W5 (11)
		if (this.get_bit(bufData[0x121], 3)) count += 1; // Path to W5 (12)
		if (this.get_bit(bufData[0x121], 4)) count += 1; // Path to W5 (13)
		if (this.get_bit(bufData[0x121], 5)) count += 1; // Path to W5 (14)
		if (this.get_bit(bufData[0x121], 6)) count += 1; // Path to W5 (15)
		if (this.get_bit(bufData[0x121], 7)) count += 1; // Path to W5 (16)
		if (this.get_bit(bufData[0x122], 0)) count += 1; // Path to W5 (17)
		if (this.get_bit(bufData[0x122], 1)) count += 1; // Path to W5 (18)
		if (this.get_bit(bufData[0x122], 2)) count += 1; // Path to W5 (19)
		if (this.get_bit(bufData[0x122], 3)) count += 1; // Path to W5 (20)
		if (this.get_bit(bufData[0x122], 4)) count += 1; // Path to W5 (21)
		if (this.get_bit(bufData[0x122], 5)) count += 1; // Path to W5 (22)
		if (this.get_bit(bufData[0x122], 6)) count += 1; // Path to W5 (23)
		if (this.get_bit(bufData[0x122], 7)) count += 1; // Path to W5 (24)
		if (this.get_bit(bufData[0x123], 0)) count += 1; // Path (11)
		if (this.get_bit(bufData[0x123], 1)) count += 1; // Path (12)
		if (this.get_bit(bufData[0x123], 2)) count += 1; // Path to Trashcan (1)
		if (this.get_bit(bufData[0x123], 3)) count += 1; // Path to Trashcan (2)
		if (this.get_bit(bufData[0x123], 4)) count += 1; // Path to Trashcan (3)
		if (this.get_bit(bufData[0x123], 5)) count += 1; // Path to Trashcan (4)
		if (this.get_bit(bufData[0x123], 6)) count += 1; // Path to Trashcan (5)
		if (this.get_bit(bufData[0x123], 7)) count += 1; // Path to Trashcan (6)
		if (this.get_bit(bufData[0x127], 0)) count += 1; // Near W5 (1)
		if (this.get_bit(bufData[0x127], 1)) count += 1; // Near W5 (2)
		if (this.get_bit(bufData[0x127], 2)) count += 1; // Near W5 (3)
		this.core.player.tiny.colored_bananas.creepy_castle = count - this.db.kong[3].tns_bananas.creepy_castle; // Subtract the bananas spent
	}

	crec_chunky_colored_bananas(bufData: Buffer) {
		let count = 0;

		// Balloons
		if (this.get_bit(bufData[0x5a], 6)) count += 10; // Museum Balloon
		if (this.get_bit(bufData[0x5b], 1)) count += 10; // Dungeon Balloon (1)
		if (this.get_bit(bufData[0x5b], 3)) count += 10; // Dungeon Balloon (2)
		if (this.get_bit(bufData[0x5b], 5)) count += 10; // Tree Balloon
		if (this.get_bit(bufData[0x5b], 6)) count += 10; // Shed Balloon

		// Bunches
		if (this.get_bit(bufData[0x128], 1)) count += 5; // Museum Bunch
		if (this.get_bit(bufData[0x12a], 5)) count += 5; // Coffin Bunch (1)
		if (this.get_bit(bufData[0x12a], 6)) count += 5; // Coffin Bunch (2)
		if (this.get_bit(bufData[0x130], 2)) count += 5; // Tree Bunch

		// Single
		if (this.get_bit(bufData[0x12c], 0)) count += 1; // Dungeon Hallway (1)
		if (this.get_bit(bufData[0x12c], 1)) count += 1; // Dungeon Hallway (2)
		if (this.get_bit(bufData[0x12c], 2)) count += 1; // Dungeon Hallway (3)
		if (this.get_bit(bufData[0x12c], 3)) count += 1; // Dungeon Hallway (4)
		if (this.get_bit(bufData[0x12c], 4)) count += 1; // Dungeon Hallway (5)
		if (this.get_bit(bufData[0x12c], 5)) count += 1; // Dungeon Hallway (6)
		if (this.get_bit(bufData[0x12c], 6)) count += 1; // Dungeon Hallway (7)
		if (this.get_bit(bufData[0x12c], 7)) count += 1; // Dungeon Hallway (8)
		if (this.get_bit(bufData[0x12d], 0)) count += 1; // Dungeon Hallway (9)
		if (this.get_bit(bufData[0x12d], 1)) count += 1; // Dungeon Hallway (10)
		if (this.get_bit(bufData[0x12d], 2)) count += 1; // Dungeon Hallway (11)
		if (this.get_bit(bufData[0x12d], 3)) count += 1; // Dungeon Hallway (12)
		if (this.get_bit(bufData[0x12d], 4)) count += 1; // Dungeon Hallway (13)
		if (this.get_bit(bufData[0x12d], 5)) count += 1; // Dungeon Hallway (14)
		if (this.get_bit(bufData[0x12d], 6)) count += 1; // Dungeon Hallway (15)
		if (this.get_bit(bufData[0x12d], 7)) count += 1; // Dungeon Hallway (16)
		if (this.get_bit(bufData[0x12e], 0)) count += 1; // Dungeon Hallway (17)
		if (this.get_bit(bufData[0x12e], 1)) count += 1; // Dungeon Hallway (18)
		if (this.get_bit(bufData[0x12e], 2)) count += 1; // Dungeon Hallway (19)
		if (this.get_bit(bufData[0x12e], 3)) count += 1; // Dungeon Hallway (20)
		if (this.get_bit(bufData[0x12e], 4)) count += 1; // Dungeon Hallway (21)
		if (this.get_bit(bufData[0x12e], 5)) count += 1; // Dungeon Hallway (22)
		if (this.get_bit(bufData[0x12e], 6)) count += 1; // Dungeon Hallway (23)
		if (this.get_bit(bufData[0x12e], 7)) count += 1; // Dungeon Hallway (24)
		if (this.get_bit(bufData[0x12f], 3)) count += 1; // Dungeon Hallway (25)
		if (this.get_bit(bufData[0x12f], 4)) count += 1; // Dungeon Hallway (26)
		if (this.get_bit(bufData[0x12f], 5)) count += 1; // Dungeon Hallway (27)
		if (this.get_bit(bufData[0x12f], 6)) count += 1; // Dungeon Hallway (28)
		if (this.get_bit(bufData[0x12f], 7)) count += 1; // Dungeon Hallway (29)
		if (this.get_bit(bufData[0x133], 0)) count += 1; // Dungeon Hallway (30)
		this.core.player.chunky.colored_bananas.creepy_castle = count - this.db.kong[4].tns_bananas.creepy_castle; // Subtract the bananas spent
	}

	handle_TnS_totals() {
		this.core.player.tns_totals.jungle_japes = this.jj_tns_totals(); // Jungle Japes
		this.core.player.tns_totals.angry_aztec = this.aa_tns_totals(); // Angry Aztec
		this.core.player.tns_totals.frantic_factory = this.frf_tns_totals(); // Frantic Factory
		this.core.player.tns_totals.gloomy_galleon = this.gg_tns_totals(); // Gloomy Galleon
		this.core.player.tns_totals.fungi_forest = this.fuf_tns_totals(); // Fungi Forest
		this.core.player.tns_totals.crystal_caves = this.cryc_tns_totals(); // Crystal Caves
		this.core.player.tns_totals.creepy_castle = this.crec_tns_totals(); // Creepy Castle
	}

	// Jungle Japes TnS Totals
	jj_tns_totals(): number {
		let count: number = 0;

		count += this.core.player.dk.troff_scoff_bananas.jungle_japes;
		count += this.core.player.diddy.troff_scoff_bananas.jungle_japes;
		count += this.core.player.lanky.troff_scoff_bananas.jungle_japes;
		count += this.core.player.tiny.troff_scoff_bananas.jungle_japes;
		count += this.core.player.chunky.troff_scoff_bananas.jungle_japes;
		return count;
	}

	// Angry Aztec TnS Totals
	aa_tns_totals(): number {
		let count: number = 0;

		count += this.core.player.dk.troff_scoff_bananas.angry_aztec;
		count += this.core.player.diddy.troff_scoff_bananas.angry_aztec;
		count += this.core.player.lanky.troff_scoff_bananas.angry_aztec;
		count += this.core.player.tiny.troff_scoff_bananas.angry_aztec;
		count += this.core.player.chunky.troff_scoff_bananas.angry_aztec;
		return count;
	}

	// Frantic Factory TnS Totals
	frf_tns_totals(): number {
		let count: number = 0;

		count += this.core.player.dk.troff_scoff_bananas.frantic_factory;
		count += this.core.player.diddy.troff_scoff_bananas.frantic_factory;
		count += this.core.player.lanky.troff_scoff_bananas.frantic_factory;
		count += this.core.player.tiny.troff_scoff_bananas.frantic_factory;
		count += this.core.player.chunky.troff_scoff_bananas.frantic_factory;
		return count;
	}

	// Gloomy Galleon TnS Totals
	gg_tns_totals(): number {
		let count: number = 0;

		count += this.core.player.dk.troff_scoff_bananas.gloomy_galleon;
		count += this.core.player.diddy.troff_scoff_bananas.gloomy_galleon;
		count += this.core.player.lanky.troff_scoff_bananas.gloomy_galleon;
		count += this.core.player.tiny.troff_scoff_bananas.gloomy_galleon;
		count += this.core.player.chunky.troff_scoff_bananas.gloomy_galleon;
		return count;
	}

	// Fungi Forest TnS Totals
	fuf_tns_totals(): number {
		let count: number = 0;

		count += this.core.player.dk.troff_scoff_bananas.fungi_forest;
		count += this.core.player.diddy.troff_scoff_bananas.fungi_forest;
		count += this.core.player.lanky.troff_scoff_bananas.fungi_forest;
		count += this.core.player.tiny.troff_scoff_bananas.fungi_forest;
		count += this.core.player.chunky.troff_scoff_bananas.fungi_forest;
		return count;
	}

	// Crystal Caves TnS Totals
	cryc_tns_totals(): number {
		let count: number = 0;

		count += this.core.player.dk.troff_scoff_bananas.crystal_caves;
		count += this.core.player.diddy.troff_scoff_bananas.crystal_caves;
		count += this.core.player.lanky.troff_scoff_bananas.crystal_caves;
		count += this.core.player.tiny.troff_scoff_bananas.crystal_caves;
		count += this.core.player.chunky.troff_scoff_bananas.crystal_caves;
		return count;
	}

	// Creepy Castle TnS Totals
	crec_tns_totals(): number {
		let count: number = 0;

		count += this.core.player.dk.troff_scoff_bananas.creepy_castle;
		count += this.core.player.diddy.troff_scoff_bananas.creepy_castle;
		count += this.core.player.lanky.troff_scoff_bananas.creepy_castle;
		count += this.core.player.tiny.troff_scoff_bananas.creepy_castle;
		count += this.core.player.chunky.troff_scoff_bananas.creepy_castle;
		return count;
	}

	handle_golden_banana_totals(bufData: Buffer) {
		this.handle_dk_golden_bananas(bufData); // Update DK totals
		this.handle_diddy_golden_bananas(bufData); // Update Diddy totals
		this.handle_lanky_golden_bananas(bufData); // Update Lanky totals
		this.handle_tiny_golden_bananas(bufData); // Update Tiny totals
		this.handle_chunky_golden_bananas(bufData); // Update Chunky totals
	}

	handle_dk_golden_bananas(bufData: Buffer) {
		this.jj_dk_golden_bananas(bufData); // Jungle Japes
		this.aa_dk_golden_bananas(bufData); // Angry Aztec
		this.frf_dk_golden_bananas(bufData); // Frantic Factory
		this.gg_dk_golden_bananas(bufData); // Gloomy Galleon
		this.fuf_dk_golden_bananas(bufData); // Fungi Forest
		this.cryc_dk_golden_bananas(bufData); // Crystal Caves
		this.crec_dk_golden_bananas(bufData); // Creepy Castle
		this.di_dk_golden_bananas(bufData); // DK Isles
	}

	handle_diddy_golden_bananas(bufData: Buffer) {
		this.jj_diddy_golden_bananas(bufData); // Jungle Japes
		this.aa_diddy_golden_bananas(bufData); // Angry Aztec
		this.frf_diddy_golden_bananas(bufData); // Frantic Factory
		this.gg_diddy_golden_bananas(bufData); // Gloomy Galleon
		this.fuf_diddy_golden_bananas(bufData); // Fungi Forest
		this.cryc_diddy_golden_bananas(bufData); // Crystal Caves
		this.crec_diddy_golden_bananas(bufData); // Creepy Castle
		this.di_diddy_golden_bananas(bufData); // DK Isles
	}

	handle_lanky_golden_bananas(bufData: Buffer) {
		this.jj_lanky_golden_bananas(bufData); // Jungle Japes
		this.aa_lanky_golden_bananas(bufData); // Angry Aztec
		this.frf_lanky_golden_bananas(bufData); // Frantic Factory
		this.gg_lanky_golden_bananas(bufData); // Gloomy Galleon
		this.fuf_lanky_golden_bananas(bufData); // Fungi Forest
		this.cryc_lanky_golden_bananas(bufData); // Crystal Caves
		this.crec_lanky_golden_bananas(bufData); // Creepy Castle
		this.di_lanky_golden_bananas(bufData); // DK Isles
	}

	handle_tiny_golden_bananas(bufData: Buffer) {
		this.jj_tiny_golden_bananas(bufData); // Jungle Japes
		this.aa_tiny_golden_bananas(bufData); // Angry Aztec
		this.frf_tiny_golden_bananas(bufData); // Frantic Factory
		this.gg_tiny_golden_bananas(bufData); // Gloomy Galleon
		this.fuf_tiny_golden_bananas(bufData); // Fungi Forest
		this.cryc_tiny_golden_bananas(bufData); // Crystal Caves
		this.crec_tiny_golden_bananas(bufData); // Creepy Castle
		this.di_tiny_golden_bananas(bufData); // DK Isles
	}

	handle_chunky_golden_bananas(bufData: Buffer) {
		this.jj_chunky_golden_bananas(bufData); // Jungle Japes
		this.aa_chunky_golden_bananas(bufData); // Angry Aztec
		this.frf_chunky_golden_bananas(bufData); // Frantic Factory
		this.gg_chunky_golden_bananas(bufData); // Gloomy Galleon
		this.fuf_chunky_golden_bananas(bufData); // Fungi Forest
		this.cryc_chunky_golden_bananas(bufData); // Crystal Caves
		this.crec_chunky_golden_bananas(bufData); // Creepy Castle
		this.di_chunky_golden_bananas(bufData); // DK Isles
	}

	// Jungle Japes Golden Bananas
	jj_dk_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x00], 3)) count += 1; // Baboon Blast banana
		if (this.get_bit(bufData[0x00], 4)) count += 1; // In front of Diddy's cage banana
		if (this.get_bit(bufData[0x00], 5)) count += 1; // In Diddy's cage banana
		if (this.get_bit(bufData[0x02], 4)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x3F], 5)) count += 1; // Blueprint banana
		this.core.player.dk.golden_bananas.jungle_japes = count;
	}

	jj_diddy_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x02], 2)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x02], 7)) count += 1; // Mountain top (W5) banana
		if (this.get_bit(bufData[0x03], 0)) count += 1; // Minecart banana
		if (this.get_bit(bufData[0x03], 7)) count += 1; // Cave banana
		if (this.get_bit(bufData[0x3F], 6)) count += 1; // Blueprint banana
		this.core.player.diddy.golden_bananas.jungle_japes = count;
	}

	jj_lanky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x00], 1)) count += 1; // Mad Maze Maul banana
		if (this.get_bit(bufData[0x01], 2)) count += 1; // Painting room banana
		if (this.get_bit(bufData[0x01], 3)) count += 1; // Speedy swing sortie banana
		if (this.get_bit(bufData[0x02], 3)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x3F], 7)) count += 1; // Blueprint banana
		this.core.player.lanky.golden_bananas.jungle_japes = count;
	}

	jj_tiny_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x00], 2)) count += 1; // Splish-Splash Salvage banana
		if (this.get_bit(bufData[0x01], 0)) count += 1; // Stump banana
		if (this.get_bit(bufData[0x01], 1)) count += 1; // Shellhive banana
		if (this.get_bit(bufData[0x02], 5)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x40], 0)) count += 1; // Blueprint banana
		this.core.player.tiny.golden_bananas.jungle_japes = count;
	}

	jj_chunky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x01], 4)) count += 1; // Underground banana
		if (this.get_bit(bufData[0x02], 6)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x03], 1)) count += 1; // Boulder banana
		if (this.get_bit(bufData[0x03], 4)) count += 1; // Minecart Mayhem banana
		if (this.get_bit(bufData[0x40], 1)) count += 1; // Blueprint banana
		this.core.player.chunky.golden_bananas.jungle_japes = count;
	}

	// Angry Aztec Golden Bananas
	aa_dk_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x06], 3)) count += 1; // Llama cage banana
		if (this.get_bit(bufData[0x07], 1)) count += 1; // 5DT banana
		if (this.get_bit(bufData[0x07], 6)) count += 1; // W5 banana
		if (this.get_bit(bufData[0x09], 5)) count += 1; // Free Lanky banana
		if (this.get_bit(bufData[0x40], 2)) count += 1; // Blueprint banana
		this.core.player.dk.golden_bananas.angry_aztec = count;
	}

	aa_diddy_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x06], 6)) count += 1; // Diddy tower banana
		if (this.get_bit(bufData[0x07], 0)) count += 1; // 5DT banana
		if (this.get_bit(bufData[0x07], 7)) count += 1; // Vulture race banana
		if (this.get_bit(bufData[0x08], 3)) count += 1; // Tiny's cage banana
		if (this.get_bit(bufData[0x40], 3)) count += 1; // Blueprint banana
		this.core.player.diddy.golden_bananas.angry_aztec = count;
	}

	aa_lanky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x07], 4)) count += 1; // 5DT banana
		if (this.get_bit(bufData[0x08], 4)) count += 1; // Vulture banana
		if (this.get_bit(bufData[0x09], 0)) count += 1; // Matching game banana
		if (this.get_bit(bufData[0x09], 1)) count += 1; // Teetering Turtle Trouble banana
		if (this.get_bit(bufData[0x40], 4)) count += 1; // Blueprint banana
		this.core.player.lanky.golden_bananas.angry_aztec = count;
	}

	aa_tiny_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x07], 2)) count += 1; // 5DT banana
		if (this.get_bit(bufData[0x08], 1)) count += 1; // Tiny tower banana
		if (this.get_bit(bufData[0x08], 7)) count += 1; // Llama temple banana
		if (this.get_bit(bufData[0x09], 3)) count += 1; // Beetle race banana
		if (this.get_bit(bufData[0x40], 5)) count += 1; // Blueprint banana
		this.core.player.tiny.golden_bananas.angry_aztec = count;
	}

	aa_chunky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x06], 1)) count += 1; // Vase banana
		if (this.get_bit(bufData[0x06], 4)) count += 1; // Hunky Chunky caged banana
		if (this.get_bit(bufData[0x07], 3)) count += 1; // 5DT banana
		if (this.get_bit(bufData[0x08], 0)) count += 1; // Rotating banana
		if (this.get_bit(bufData[0x40], 6)) count += 1; // Blueprint banana
		this.core.player.chunky.golden_bananas.angry_aztec = count;
	}

	// Frantic Factory Golden Bananas
	frf_dk_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x0E], 0)) count += 1; // Power shed banana
		if (this.get_bit(bufData[0x0F], 2)) count += 1; // Number game banana
		if (this.get_bit(bufData[0x10], 0)) count += 1; // Crusher room banana
		if (this.get_bit(bufData[0x10], 2)) count += 1; // Arcade banana
		if (this.get_bit(bufData[0x40], 7)) count += 1; // Blueprint banana
		this.core.player.dk.golden_bananas.frantic_factory = count;
	}

	frf_diddy_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x0E], 1)) count += 1; // Production room banana
		if (this.get_bit(bufData[0x0F], 6)) count += 1; // R&D banana
		if (this.get_bit(bufData[0x10], 6)) count += 1; // Beaver Bother banana
		if (this.get_bit(bufData[0x10], 7)) count += 1; // Block Tower banana
		if (this.get_bit(bufData[0x41], 0)) count += 1; // Blueprint banana
		this.core.player.diddy.golden_bananas.frantic_factory = count;
	}

	frf_lanky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x0E], 3)) count += 1; // Production room banana
		if (this.get_bit(bufData[0x0E], 6)) count += 1; // Free Chunky banana
		if (this.get_bit(bufData[0x0F], 5)) count += 1; // Piano game (R&D) banana
		if (this.get_bit(bufData[0x11], 1)) count += 1; // Batty Barrel Bandit banana
		if (this.get_bit(bufData[0x41], 1)) count += 1; // Blueprint banana
		this.core.player.lanky.golden_bananas.frantic_factory = count;
	}

	frf_tiny_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x0E], 4)) count += 1; // Production room banana
		if (this.get_bit(bufData[0x0F], 3)) count += 1; // Arcade Room banana
		if (this.get_bit(bufData[0x0F], 4)) count += 1; // Bad Hit Detection Wheel banana
		if (this.get_bit(bufData[0x11], 3)) count += 1; // Car race banana
		if (this.get_bit(bufData[0x41], 2)) count += 1; // Blueprint banana
		this.core.player.tiny.golden_bananas.frantic_factory = count;
	}

	frf_chunky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x0E], 2)) count += 1; // Production room banana
		if (this.get_bit(bufData[0x0F], 1)) count += 1; // Dark room banana
		if (this.get_bit(bufData[0x0F], 7)) count += 1; // R&D banana
		if (this.get_bit(bufData[0x11], 0)) count += 1; // Stash Snatch banana
		if (this.get_bit(bufData[0x41], 3)) count += 1; // Blueprint banana
		this.core.player.chunky.golden_bananas.frantic_factory = count;
	}

	// Gloomy Galleon Golden Bananas
	gg_dk_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x13], 5)) count += 1; // Lighthouse banana
		if (this.get_bit(bufData[0x14], 5)) count += 1; // Seal race banana
		if (this.get_bit(bufData[0x18], 1)) count += 1; // Seal banana
		if (this.get_bit(bufData[0x19], 0)) count += 1; // 5DS banana
		if (this.get_bit(bufData[0x41], 4)) count += 1; // Blueprint banana
		this.core.player.dk.golden_bananas.gloomy_galleon = count;
	}

	gg_diddy_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x14], 3)) count += 1; // W3 banana
		if (this.get_bit(bufData[0x14], 7)) count += 1; // Mechfish banana
		if (this.get_bit(bufData[0x18], 6)) count += 1; // 5DS banana
		if (this.get_bit(bufData[0x19], 4)) count += 1; // Lighthouse banana
		if (this.get_bit(bufData[0x41], 5)) count += 1; // Blueprint banana
		this.core.player.diddy.golden_bananas.gloomy_galleon = count;
	}

	gg_lanky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x14], 4)) count += 1; // Gold tower banana
		if (this.get_bit(bufData[0x16], 7)) count += 1; // 2DS (Enguarde) banana
		if (this.get_bit(bufData[0x18], 0)) count += 1; // Chest banana
		if (this.get_bit(bufData[0x18], 7)) count += 1; // 5DS (bed) banana
		if (this.get_bit(bufData[0x41], 6)) count += 1; // Blueprint banana
		this.core.player.lanky.golden_bananas.gloomy_galleon = count;
	}

	gg_tiny_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x17], 0)) count += 1; // 2DS banana
		if (this.get_bit(bufData[0x17], 7)) count += 1; // Pearls banana
		if (this.get_bit(bufData[0x19], 1)) count += 1; // 5DS banana
		if (this.get_bit(bufData[0x19], 2)) count += 1; // Submarine banana
		if (this.get_bit(bufData[0x41], 7)) count += 1; // Blueprint banana
		this.core.player.tiny.golden_bananas.gloomy_galleon = count;
	}

	gg_chunky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x13], 2)) count += 1; // Cannon game banana
		if (this.get_bit(bufData[0x14], 6)) count += 1; // Seasick banana
		if (this.get_bit(bufData[0x16], 6)) count += 1; // Chests banana
		if (this.get_bit(bufData[0x18], 5)) count += 1; // 5DS banana
		if (this.get_bit(bufData[0x42], 0)) count += 1; // Blueprint banana
		this.core.player.chunky.golden_bananas.gloomy_galleon = count;
	}

	// Fungi Forest Golden Bananas
	fuf_dk_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x1B], 3)) count += 1; // Mill banana
		if (this.get_bit(bufData[0x1C], 4)) count += 1; // Cannon banana
		if (this.get_bit(bufData[0x1D], 3)) count += 1; // Minecart Mayhem banana
		if (this.get_bit(bufData[0x1F], 6)) count += 1; // Baboon Blast banana
		if (this.get_bit(bufData[0x42], 1)) count += 1; // Blueprint banana
		this.core.player.dk.golden_bananas.fungi_forest = count;
	}

	fuf_diddy_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x1A], 3)) count += 1; // Top of mushroom banana
		if (this.get_bit(bufData[0x1A], 6)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x1B], 0)) count += 1; // Barn banana
		if (this.get_bit(bufData[0x1F], 2)) count += 1; // Owl race banana
		if (this.get_bit(bufData[0x42], 2)) count += 1; // Blueprint banana
		this.core.player.diddy.golden_bananas.fungi_forest = count;
	}

	fuf_lanky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x1B], 1)) count += 1; // Attic banana
		if (this.get_bit(bufData[0x1C], 0)) count += 1; // Colored Mushroom Puzzle banana
		if (this.get_bit(bufData[0x1C], 2)) count += 1; // Bouncy mushroom banana
		if (this.get_bit(bufData[0x1F], 1)) count += 1; // Rabbit race banana
		if (this.get_bit(bufData[0x42], 3)) count += 1; // Blueprint banana
		this.core.player.lanky.golden_bananas.fungi_forest = count;
	}

	fuf_tiny_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x19], 5)) count += 1; // Anthill banana
		if (this.get_bit(bufData[0x1A], 1)) count += 1; // Beanstalk banana
		if (this.get_bit(bufData[0x1C], 3)) count += 1; // Speedy Swing Sortie banana
		if (this.get_bit(bufData[0x1E], 7)) count += 1; // Spider miniboss banana
		if (this.get_bit(bufData[0x42], 4)) count += 1; // Blueprint banana
		this.core.player.tiny.golden_bananas.fungi_forest = count;
	}

	fuf_chunky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x1A], 7)) count += 1; // Minecart banana
		if (this.get_bit(bufData[0x1B], 5)) count += 1; // Mill banana
		if (this.get_bit(bufData[0x1C], 1)) count += 1; // Face game banana
		if (this.get_bit(bufData[0x1F], 5)) count += 1; // Apple banana
		if (this.get_bit(bufData[0x42], 5)) count += 1; // Blueprint banana
		this.core.player.chunky.golden_bananas.fungi_forest = count;
	}

	// Crystal Caves Golden Bananas
	cryc_dk_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x20], 5)) count += 1; // 5DC banana
		if (this.get_bit(bufData[0x22], 3)) count += 1; // 5DI banana
		if (this.get_bit(bufData[0x22], 4)) count += 1; // Rotating room banana
		if (this.get_bit(bufData[0x25], 2)) count += 1; // Baboon Blast banana
		if (this.get_bit(bufData[0x42], 6)) count += 1; // Blueprint banana
		this.core.player.dk.golden_bananas.crystal_caves = count;
	}

	cryc_diddy_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x20], 6)) count += 1; // Lower 5DC banana
		if (this.get_bit(bufData[0x22], 2)) count += 1; // 5DI banana
		if (this.get_bit(bufData[0x24], 5)) count += 1; // Cabin (Upper) banana
		if (this.get_bit(bufData[0x24], 6)) count += 1; // Mad Maze Maul banana
		if (this.get_bit(bufData[0x42], 7)) count += 1; // Blueprint banana
		this.core.player.diddy.golden_bananas.crystal_caves = count;
	}

	cryc_lanky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x20], 3)) count += 1; // Beetle race banana
		if (this.get_bit(bufData[0x21], 0)) count += 1; // Lanky cabin banana
		if (this.get_bit(bufData[0x21], 7)) count += 1; // Ice tomato banana
		if (this.get_bit(bufData[0x23], 1)) count += 1; // 5DI banana
		if (this.get_bit(bufData[0x43], 0)) count += 1; // Blueprint banana
		this.core.player.lanky.golden_bananas.crystal_caves = count;
	}

	cryc_tiny_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x20], 4)) count += 1; // 5DC banana
		if (this.get_bit(bufData[0x22], 7)) count += 1; // Igloo banana
		if (this.get_bit(bufData[0x24], 7)) count += 1; // W3 banana
		if (this.get_bit(bufData[0x25], 1)) count += 1; // Mini monkey igloo banana
		if (this.get_bit(bufData[0x43], 1)) count += 1; // Blueprint banana
		this.core.player.tiny.golden_bananas.crystal_caves = count;
	}

	cryc_chunky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x20], 7)) count += 1; // 5DC banana
		if (this.get_bit(bufData[0x21], 4)) count += 1; // Entrance ice wall banana
		if (this.get_bit(bufData[0x21], 6)) count += 1; // Chunky igloo banana
		if (this.get_bit(bufData[0x22], 6)) count += 1; // 5DI banana
		if (this.get_bit(bufData[0x43], 2)) count += 1; // Blueprint banana
		this.core.player.chunky.golden_bananas.crystal_caves = count;
	}

	// Creepy Castle Golden Bananas
	crec_dk_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x27], 1)) count += 1; // Library banana
		if (this.get_bit(bufData[0x27], 6)) count += 1; // Minecart banana
		if (this.get_bit(bufData[0x28], 0)) count += 1; // Tree banana
		if (this.get_bit(bufData[0x28], 6)) count += 1; // Face puzzle banana
		if (this.get_bit(bufData[0x43], 3)) count += 1; // Blueprint banana
		this.core.player.dk.golden_bananas.creepy_castle = count;
	}

	crec_diddy_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x26], 1)) count += 1; // Ballroom banana
		if (this.get_bit(bufData[0x26], 6)) count += 1; // Crypt banana
		if (this.get_bit(bufData[0x2B], 6)) count += 1; // Big Bug Bash banana
		if (this.get_bit(bufData[0x2C], 1)) count += 1; // Chain room banana
		if (this.get_bit(bufData[0x43], 4)) count += 1; // Blueprint banana
		this.core.player.diddy.golden_bananas.creepy_castle = count;
	}

	crec_lanky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x26], 2)) count += 1; // Lanky tower banana
		if (this.get_bit(bufData[0x26], 4)) count += 1; // Orangstand banana
		if (this.get_bit(bufData[0x27], 4)) count += 1; // Dungeon banana
		if (this.get_bit(bufData[0x28], 3)) count += 1; // Greenhouse banana
		if (this.get_bit(bufData[0x43], 5)) count += 1; // Blueprint banana
		this.core.player.lanky.golden_bananas.creepy_castle = count;
	}

	crec_tiny_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x26], 5)) count += 1; // Goo hands banana
		if (this.get_bit(bufData[0x27], 3)) count += 1; // Dungeon banana
		if (this.get_bit(bufData[0x28], 5)) count += 1; // Car race banana
		if (this.get_bit(bufData[0x2B], 7)) count += 1; // Trashcan banana
		if (this.get_bit(bufData[0x43], 6)) count += 1; // Blueprint banana
		this.core.player.tiny.golden_bananas.creepy_castle = count;
	}

	crec_chunky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x26], 7)) count += 1; // Crypt banana
		if (this.get_bit(bufData[0x27], 2)) count += 1; // Museum banana
		if (this.get_bit(bufData[0x27], 7)) count += 1; // Tree banana
		if (this.get_bit(bufData[0x28], 2)) count += 1; // Shed banana
		if (this.get_bit(bufData[0x43], 7)) count += 1; // Blueprint banana
		this.core.player.chunky.golden_bananas.creepy_castle = count;
	}

	// DK Isles Golden Bananas
	di_dk_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x2F], 5)) count += 1; // Boulder banana
		if (this.get_bit(bufData[0x32], 4)) count += 1; // Frantic Factory Lobby instrument banana
		if (this.get_bit(bufData[0x33], 3)) count += 1; // Crystal Caves Lobby banana
		if (this.get_bit(bufData[0x34], 4)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x44], 0)) count += 1; // Blueprint banana
		this.core.player.dk.golden_bananas.dk_isles = count;
	}

	di_diddy_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x33], 2)) count += 1; // Crystal Caves Lobby instrument banana
		if (this.get_bit(bufData[0x34], 0)) count += 1; // Batty Barrel Bandit banana
		if (this.get_bit(bufData[0x34], 7)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x35], 4)) count += 1; // Peril Path Panic banana
		if (this.get_bit(bufData[0x44], 1)) count += 1; // Blueprint banana
		this.core.player.diddy.golden_bananas.dk_isles = count;
	}

	di_lanky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x31], 6)) count += 1; // Japes Lobby instrument banana
		if (this.get_bit(bufData[0x33], 7)) count += 1; // Castle Lobby Searchlight Seek banana
		if (this.get_bit(bufData[0x34], 5)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x35], 5)) count += 1; // Sprint banana
		if (this.get_bit(bufData[0x44], 2)) count += 1; // Blueprint banana
		this.core.player.lanky.golden_bananas.dk_isles = count;
	}

	di_tiny_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x25], 5)) count += 1; // Rareware banana
		if (this.get_bit(bufData[0x32], 2)) count += 1; // Big Bug Bash banana
		if (this.get_bit(bufData[0x32], 3)) count += 1; // Galleon Lobby banana
		if (this.get_bit(bufData[0x34], 4)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x35], 1)) count += 1; // High instrument pad banana
		if (this.get_bit(bufData[0x44], 3)) count += 1; // Blueprint banana
		this.core.player.tiny.golden_bananas.dk_isles = count;
	}

	di_chunky_golden_bananas(bufData: Buffer) {
		let count = 0;

		if (this.get_bit(bufData[0x32], 6)) count += 1; // Helm Lobby Kremling Kosh banana
		if (this.get_bit(bufData[0x34], 6)) count += 1; // Caged banana
		if (this.get_bit(bufData[0x35], 0)) count += 1; // Instrument pad banana
		if (this.get_bit(bufData[0x35], 7)) count += 1; // Pound the X banana
		if (this.get_bit(bufData[0x44], 4)) count += 1; // Blueprint banana
		this.core.player.chunky.golden_bananas.dk_isles = count;
	}

	// Update all coin totals
	handle_coin_totals(bufData: Buffer) {
		this.dk_coin_totals(bufData); // Update DK coins
		this.diddy_coin_totals(bufData); // Update Diddy coins
		this.lanky_coin_totals(bufData); // Update Lanky coins
		this.tiny_coin_totals(bufData); // Update Tiny coins
		this.chunky_coin_totals(bufData); // Update Chunky coins
	}

	dk_coin_totals(bufData: Buffer) {
		let count = 0;
		let coins_spent = 0;

		count += this.rainbow_coins(bufData); // Rainbow Coins
		count += this.tg_dk_coins(bufData); // Training Grounds
		count += this.jj_dk_coins(bufData); // Jungle Japes
		count += this.aa_dk_coins(bufData); // Angry Aztec
		count += this.frf_dk_coins(bufData); // Frantic Factory
		count += this.gg_dk_coins(bufData); // Gloomy Galleon
		count += this.fuf_dk_coins(bufData); // Fungi Forest
		count += this.cryc_dk_coins(bufData); // Crystal Caves
		count += this.crec_dk_coins(bufData); // Creepy Castle

		// Simian Slam
		if (this.core.player.dk.simian_slam > 1) coins_spent += 5;
		if (this.core.player.dk.simian_slam > 2) coins_spent += 7;

		// Moves
		if (this.core.player.dk.moves > 0) coins_spent += 3;
		if (this.core.player.dk.moves > 1) coins_spent += 5;
		if (this.core.player.dk.moves > 2) coins_spent += 7;

		// Weapon
		if (this.get_bit(this.core.player.dk.weapon, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.dk.weapon, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.dk.weapon, 2)) coins_spent += 7;

		// Ammo Belt
		if (this.core.player.dk.ammo_belt > 0) coins_spent += 3;
		if (this.core.player.dk.ammo_belt > 1) coins_spent += 5;

		// Instrument
		if (this.get_bit(this.core.player.dk.instrument, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.dk.instrument, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.dk.instrument, 2)) coins_spent += 7;
		if (this.get_bit(this.core.player.dk.instrument, 3)) coins_spent += 9;

		count -= coins_spent;
		if (count < 0) count = 0;
		this.core.player.dk.coins = count;
	}

	diddy_coin_totals(bufData: Buffer) {
		let count = 0;
		let coins_spent = 0;

		count += this.rainbow_coins(bufData); // Rainbow Coins
		count += this.jj_diddy_coins(bufData); // Jungle Japes
		count += this.aa_diddy_coins(bufData); // Angry Aztec
		count += this.frf_diddy_coins(bufData); // Frantic Factory
		count += this.gg_diddy_coins(bufData); // Gloomy Galleon
		count += this.fuf_diddy_coins(bufData); // Fungi Forest
		count += this.cryc_diddy_coins(bufData); // Crystal Caves
		count += this.crec_diddy_coins(bufData); // Creepy Castle

		// Simian Slam
		if (this.core.player.diddy.simian_slam > 1) coins_spent += 5;
		if (this.core.player.diddy.simian_slam > 2) coins_spent += 7;

		// Moves
		if (this.core.player.diddy.moves > 0) coins_spent += 3;
		if (this.core.player.diddy.moves > 1) coins_spent += 5;
		if (this.core.player.diddy.moves > 2) coins_spent += 7;

		// Weapon
		if (this.get_bit(this.core.player.diddy.weapon, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.diddy.weapon, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.diddy.weapon, 2)) coins_spent += 7;

		// Ammo Belt
		if (this.core.player.diddy.ammo_belt > 0) coins_spent += 3;
		if (this.core.player.diddy.ammo_belt > 1) coins_spent += 5;

		// Instrument
		if (this.get_bit(this.core.player.diddy.instrument, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.diddy.instrument, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.diddy.instrument, 2)) coins_spent += 7;
		if (this.get_bit(this.core.player.diddy.instrument, 3)) coins_spent += 9;

		count -= coins_spent;
		if (count < 0) count = 0;
		this.core.player.diddy.coins = count;
	}

	lanky_coin_totals(bufData: Buffer) {
		let count = 0;
		let coins_spent = 0;

		count += this.rainbow_coins(bufData); // Rainbow Coins
		count += this.jj_lanky_coins(bufData); // Jungle Japes
		count += this.aa_lanky_coins(bufData); // Angry Aztec
		count += this.frf_lanky_coins(bufData); // Frantic Factory
		count += this.gg_lanky_coins(bufData); // Gloomy Galleon
		count += this.fuf_lanky_coins(bufData); // Fungi Forest
		count += this.cryc_lanky_coins(bufData); // Crystal Caves
		count += this.crec_lanky_coins(bufData); // Creepy Castle

		// Simian Slam
		if (this.core.player.lanky.simian_slam > 1) coins_spent += 5;
		if (this.core.player.lanky.simian_slam > 2) coins_spent += 7;

		// Moves
		if (this.core.player.lanky.moves > 0) coins_spent += 3;
		if (this.core.player.lanky.moves > 1) coins_spent += 5;
		if (this.core.player.lanky.moves > 2) coins_spent += 7;

		// Weapon
		if (this.get_bit(this.core.player.lanky.weapon, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.lanky.weapon, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.lanky.weapon, 2)) coins_spent += 7;

		// Ammo Belt
		if (this.core.player.lanky.ammo_belt > 0) coins_spent += 3;
		if (this.core.player.lanky.ammo_belt > 1) coins_spent += 5;

		// Instrument
		if (this.get_bit(this.core.player.lanky.instrument, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.lanky.instrument, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.lanky.instrument, 2)) coins_spent += 7;
		if (this.get_bit(this.core.player.lanky.instrument, 3)) coins_spent += 9;

		count -= coins_spent;
		if (count < 0) count = 0;
		this.core.player.lanky.coins = count;
	}

	tiny_coin_totals(bufData: Buffer) {
		let count = 0;
		let coins_spent = 0;

		count += this.rainbow_coins(bufData); // Rainbow Coins
		count += this.jj_tiny_coins(bufData); // Jungle Japes
		count += this.aa_tiny_coins(bufData); // Angry Aztec
		count += this.frf_tiny_coins(bufData); // Frantic Factory
		count += this.gg_tiny_coins(bufData); // Gloomy Galleon
		count += this.fuf_tiny_coins(bufData); // Fungi Forest
		count += this.cryc_tiny_coins(bufData); // Crystal Caves
		count += this.crec_tiny_coins(bufData); // Creepy Castle

		// Simian Slam
		if (this.core.player.tiny.simian_slam > 1) coins_spent += 5;
		if (this.core.player.tiny.simian_slam > 2) coins_spent += 7;

		// Moves
		if (this.core.player.tiny.moves > 0) coins_spent += 3;
		if (this.core.player.tiny.moves > 1) coins_spent += 5;
		if (this.core.player.tiny.moves > 2) coins_spent += 7;

		// Weapon
		if (this.get_bit(this.core.player.tiny.weapon, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.tiny.weapon, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.tiny.weapon, 2)) coins_spent += 7;

		// Ammo Belt
		if (this.core.player.tiny.ammo_belt > 0) coins_spent += 3;
		if (this.core.player.tiny.ammo_belt > 1) coins_spent += 5;

		// Instrument
		if (this.get_bit(this.core.player.tiny.instrument, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.tiny.instrument, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.tiny.instrument, 2)) coins_spent += 7;
		if (this.get_bit(this.core.player.tiny.instrument, 3)) coins_spent += 9;

		count -= coins_spent;
		if (count < 0) count = 0;
		this.core.player.tiny.coins = count;
	}

	chunky_coin_totals(bufData: Buffer) {
		let count = 0;
		let coins_spent = 0;

		count += this.rainbow_coins(bufData); // Rainbow Coins
		count += this.jj_chunky_coins(bufData); // Jungle Japes
		count += this.aa_chunky_coins(bufData); // Angry Aztec
		count += this.frf_chunky_coins(bufData); // Frantic Factory
		count += this.gg_chunky_coins(bufData); // Gloomy Galleon
		count += this.fuf_chunky_coins(bufData); // Fungi Forest
		count += this.cryc_chunky_coins(bufData); // Crystal Caves
		count += this.crec_chunky_coins(bufData); // Creepy Castle

		// Simian Slam
		if (this.core.player.chunky.simian_slam > 1) coins_spent += 5;
		if (this.core.player.chunky.simian_slam > 2) coins_spent += 7;

		// Moves
		if (this.core.player.chunky.moves > 0) coins_spent += 3;
		if (this.core.player.chunky.moves > 1) coins_spent += 5;
		if (this.core.player.chunky.moves > 2) coins_spent += 7;

		// Weapon
		if (this.get_bit(this.core.player.chunky.weapon, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.chunky.weapon, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.chunky.weapon, 2)) coins_spent += 7;

		// Ammo Belt
		if (this.core.player.chunky.ammo_belt > 0) coins_spent += 3;
		if (this.core.player.chunky.ammo_belt > 1) coins_spent += 5;

		// Instrument
		if (this.get_bit(this.core.player.chunky.instrument, 0)) coins_spent += 3;
		if (this.get_bit(this.core.player.chunky.instrument, 1)) coins_spent += 5;
		if (this.get_bit(this.core.player.chunky.instrument, 2)) coins_spent += 7;
		if (this.get_bit(this.core.player.chunky.instrument, 3)) coins_spent += 9;

		count -= coins_spent;
		if (count < 0) count = 0;
		this.core.player.chunky.coins = count;
	}

	// Jungle Japes Coins
	jj_dk_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x69], 2)) count += 1; // Rambi Box (1)
		if (this.get_bit(bufData[0x6b], 0)) count += 1; // Baboon Blast Pad (1)
		if (this.get_bit(bufData[0x6b], 4)) count += 1; // Entrance (1)
		if (this.get_bit(bufData[0x6d], 6)) count += 1; // Baboon Blast Pad (2)
		if (this.get_bit(bufData[0x6d], 7)) count += 1; // Entrance (2)
		if (this.get_bit(bufData[0x6e], 1)) count += 1; // Rambi Box (2)
		if (this.get_bit(bufData[0x6e], 2)) count += 1; // W4 Hallway
		if (this.get_bit(bufData[0x6e], 3)) count += 1; // BP (1)
		if (this.get_bit(bufData[0x6f], 7)) count += 1; // Entrance (3)
		if (this.get_bit(bufData[0x73], 1)) count += 1; // Baboon Blast Pad (3)
		if (this.get_bit(bufData[0x78], 6)) count += 1; // BP (2)
		if (this.get_bit(bufData[0x7b], 6)) count += 1; // Rambi Box (3)
		if (this.get_bit(bufData[0x7c], 7)) count += 1; // Baboon Blast (1)
		if (this.get_bit(bufData[0x7f], 0)) count += 1; // BP (3)
		if (this.get_bit(bufData[0x83], 0)) count += 1; // Baboon Blast (2)
		return count;
	}

	jj_diddy_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x67], 0)) count += 1; // Inside Mountain (1)
		if (this.get_bit(bufData[0x67], 1)) count += 1; // Inside Mountain (2)
		if (this.get_bit(bufData[0x67], 2)) count += 1; // Inside Mountain (3)
		if (this.get_bit(bufData[0x67], 4)) count += 1; // Inside Mountain (4)
		if (this.get_bit(bufData[0x69], 0)) count += 1; // Peanut Gate GB (1)
		if (this.get_bit(bufData[0x6c], 2)) count += 1; // Peanut gate GB (2)
		if (this.get_bit(bufData[0x6c], 7)) count += 1; // Cannon (1)
		if (this.get_bit(bufData[0x6d], 2)) count += 1; // Cannon (2)
		if (this.get_bit(bufData[0x6f], 2)) count += 1; // BP (1)
		if (this.get_bit(bufData[0x72], 1)) count += 1; // Peanut Gate GB (3)
		if (this.get_bit(bufData[0x72], 4)) count += 1; // BP (2)
		if (this.get_bit(bufData[0x77], 2)) count += 1; // In Water (Left) (1)
		if (this.get_bit(bufData[0x77], 4)) count += 1; // In Water (Left) (2)
		if (this.get_bit(bufData[0x77], 5)) count += 1; // In Water (Left) (3)
		if (this.get_bit(bufData[0x7b], 3)) count += 1; // BP (3)
		return count;
	}

	jj_lanky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x68], 7)) count += 1; // Cave Near Entrance (1)
		if (this.get_bit(bufData[0x6c], 1)) count += 1; // Near BP
		if (this.get_bit(bufData[0x6f], 0)) count += 1; // Cave Near Entrance (2)
		if (this.get_bit(bufData[0x6f], 1)) count += 1; // Cave Near Entrance (3)
		if (this.get_bit(bufData[0x73], 5)) count += 1; // In Water (Left) (1)
		if (this.get_bit(bufData[0x73], 6)) count += 1; // In Water (Left) (2)
		if (this.get_bit(bufData[0x74], 7)) count += 1; // Bonus Barrel Room (1)
		if (this.get_bit(bufData[0x78], 2)) count += 1; // By Snide's (1)
		if (this.get_bit(bufData[0x78], 4)) count += 1; // By Snide's (2)
		if (this.get_bit(bufData[0x78], 5)) count += 1; // By Snide's (3)
		if (this.get_bit(bufData[0x7b], 0)) count += 1; // Bonus Barrel Room (2)
		if (this.get_bit(bufData[0x7b], 4)) count += 1; // By Snide's (4)
		if (this.get_bit(bufData[0x7b], 5)) count += 1; // By Snide's (5)
		if (this.get_bit(bufData[0x7e], 5)) count += 1; // in Painting Room (Left)
		if (this.get_bit(bufData[0x7e], 6)) count += 1; // in Painting Room (Right)
		return count;
	}

	jj_tiny_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x69], 1)) count += 1; // Near Fairy
		if (this.get_bit(bufData[0x6d], 1)) count += 1; // Fairy Cave (1)
		if (this.get_bit(bufData[0x6e], 4)) count += 1; // BP (1)
		if (this.get_bit(bufData[0x6f], 6)) count += 1; // BP (2)
		if (this.get_bit(bufData[0x76], 0)) count += 1; // W5 (1)
		if (this.get_bit(bufData[0x76], 1)) count += 1; // W5 (2)
		if (this.get_bit(bufData[0x78], 7)) count += 1; // BP (3)
		if (this.get_bit(bufData[0x7a], 0)) count += 1; // W5 (3)
		if (this.get_bit(bufData[0x7a], 1)) count += 1; // W5 (4)
		if (this.get_bit(bufData[0x7a], 2)) count += 1; // Fairy Cave (2)
		if (this.get_bit(bufData[0x7a], 3)) count += 1; // Fairy Cave (3)
		if (this.get_bit(bufData[0x7a], 4)) count += 1; // Fairy Cave (4)
		if (this.get_bit(bufData[0x7b], 7)) count += 1; // W5 (5)
		if (this.get_bit(bufData[0x7c], 0)) count += 1; // Underground (1)
		if (this.get_bit(bufData[0x7c], 3)) count += 1; // Underground (2)
		if (this.get_bit(bufData[0x7d], 1)) count += 1; // Underground (3)
		if (this.get_bit(bufData[0x7f], 1)) count += 1; // Inside Shellhive (1)
		if (this.get_bit(bufData[0x7f], 2)) count += 1; // Inside Shellhive (2)
		return count;
	}

	jj_chunky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x64], 0)) count += 1; // By Portal (1)
		if (this.get_bit(bufData[0x64], 1)) count += 1; // In Water (1)
		if (this.get_bit(bufData[0x68], 0)) count += 1; // By portal (2)
		if (this.get_bit(bufData[0x68], 2)) count += 1; // In Water (2)
		if (this.get_bit(bufData[0x68], 3)) count += 1; // In Water (3)
		if (this.get_bit(bufData[0x73], 2)) count += 1; // By portal (3)
		if (this.get_bit(bufData[0x77], 6)) count += 1; // Stump (1)
		if (this.get_bit(bufData[0x77], 7)) count += 1; // Stump (2)
		if (this.get_bit(bufData[0x7b], 2)) count += 1; // Stump (3)
		if (this.get_bit(bufData[0x7c], 4)) count += 1; // Underground (1)
		if (this.get_bit(bufData[0x7c], 5)) count += 1; // Underground (2)
		if (this.get_bit(bufData[0x7d], 2)) count += 1; // Underground (3)
		return count;
	}

	// Angry Aztec Coins
	aa_dk_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x84], 0)) count += 1; // 5DT (1)
		if (this.get_bit(bufData[0x84], 2)) count += 1; // Llama Temple Bongo Pad (1)
		if (this.get_bit(bufData[0x84], 4)) count += 1; // Llama Temple Bongo Pad (2)
		if (this.get_bit(bufData[0x85], 7)) count += 1; // 5DT (2)
		if (this.get_bit(bufData[0x8a], 1)) count += 1; // Llama Temple Bongo Pad (3)
		if (this.get_bit(bufData[0x8a], 2)) count += 1; // Llama Temple Bongo Pad (4)
		if (this.get_bit(bufData[0x8a], 3)) count += 1; // Llama Temple Bongo Pad (5)
		if (this.get_bit(bufData[0x90], 0)) count += 1; // Llama Cage (1)
		if (this.get_bit(bufData[0x91], 2)) count += 1; // Snide TB (1)
		if (this.get_bit(bufData[0x91], 6)) count += 1; // Snide TB (2)
		if (this.get_bit(bufData[0x91], 7)) count += 1; // Llama Cage (2)
		if (this.get_bit(bufData[0x92], 7)) count += 1; // Snide TB (3)
		if (this.get_bit(bufData[0x96], 3)) count += 1; // Tunnel to Totem (1)
		if (this.get_bit(bufData[0x96], 4)) count += 1; // Tunnel to Totem (2)
		if (this.get_bit(bufData[0x96], 5)) count += 1; // Tunnel to Totem (3)
		if (this.get_bit(bufData[0xa2], 0)) count += 1; // Near BP (1)
		if (this.get_bit(bufData[0xa3], 6)) count += 1; // Near BP (2)
		if (this.get_bit(bufData[0xa3], 7)) count += 1; // Near BP (3)
		return count;
	}

	aa_diddy_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x82], 6)) count += 1; // Instrument Pad (Tiny Temple)
		if (this.get_bit(bufData[0x85], 2)) count += 1; // Tiny Cage (1)
		if (this.get_bit(bufData[0x85], 3)) count += 1; // Tiny Cage (2)
		if (this.get_bit(bufData[0x85], 4)) count += 1; // Tiny Cage (3)
		if (this.get_bit(bufData[0x85], 5)) count += 1; // Tiny Cage (4)
		if (this.get_bit(bufData[0x85], 6)) count += 1; // Tiny Cage (5)
		if (this.get_bit(bufData[0x8e], 6)) count += 1; // W2 (1)
		if (this.get_bit(bufData[0x8f], 1)) count += 1; // 5DT (1)
		if (this.get_bit(bufData[0x8f], 2)) count += 1; // 5DT (2)
		if (this.get_bit(bufData[0x90], 1)) count += 1; // W2 (2)
		if (this.get_bit(bufData[0x90], 2)) count += 1; // W2 (3)
		if (this.get_bit(bufData[0x90], 3)) count += 1; // W2 (4)
		if (this.get_bit(bufData[0x92], 4)) count += 1; // W2 (5)
		if (this.get_bit(bufData[0x94], 4)) count += 1; // Hallway (1)
		if (this.get_bit(bufData[0x94], 5)) count += 1; // Hallway (2)
		if (this.get_bit(bufData[0x94], 6)) count += 1; // Hallway (3)
		if (this.get_bit(bufData[0x94], 7)) count += 1; // Chunky Cage
		return count;
	}

	aa_lanky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x81], 4)) count += 1; // Tiny Temple (1)
		if (this.get_bit(bufData[0x81], 5)) count += 1; // Tiny Temple (2)
		if (this.get_bit(bufData[0x86], 6)) count += 1; // Tiny Temple (3)
		if (this.get_bit(bufData[0x88], 6)) count += 1; // Matching Game (1)
		if (this.get_bit(bufData[0x88], 7)) count += 1; // Matching Game (2)
		if (this.get_bit(bufData[0x8e], 2)) count += 1; // Cranky (1)
		if (this.get_bit(bufData[0x8e], 4)) count += 1; // W4 Funky (1)
		if (this.get_bit(bufData[0x91], 3)) count += 1; // W4 Funky (2)
		if (this.get_bit(bufData[0x91], 4)) count += 1; // W4 Funky (3)
		if (this.get_bit(bufData[0x98], 2)) count += 1; // Behind 5DT (1)
		if (this.get_bit(bufData[0x98], 3)) count += 1; // Behind 5DT (2)
		if (this.get_bit(bufData[0x99], 1)) count += 1; // W4 Funky (4)
		if (this.get_bit(bufData[0x9c], 1)) count += 1; // Cranky (2)
		if (this.get_bit(bufData[0x9c], 2)) count += 1; // Cranky (3)
		if (this.get_bit(bufData[0x9c], 3)) count += 1; // Cranky (4)
		if (this.get_bit(bufData[0x9d], 6)) count += 1; // Behind 5DT (3)
		if (this.get_bit(bufData[0x9d], 7)) count += 1; // W4 Funky (5)
		return count;
	}

	aa_tiny_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x80], 6)) count += 1; // Near Crown (1)
		if (this.get_bit(bufData[0x81], 1)) count += 1; // Near Crown (2)
		if (this.get_bit(bufData[0x82], 7)) count += 1; // Near Crown (3)
		if (this.get_bit(bufData[0x85], 1)) count += 1; // Near Crown (4)
		if (this.get_bit(bufData[0x89], 5)) count += 1; // Llama Temple (1)
		if (this.get_bit(bufData[0x89], 6)) count += 1; // Llama Temple (2)
		if (this.get_bit(bufData[0x89], 7)) count += 1; // Llama Temple (3)
		if (this.get_bit(bufData[0x8f], 3)) count += 1; // Tiny 5DT (1)
		if (this.get_bit(bufData[0x8f], 4)) count += 1; // Tiny 5DT (2)
		if (this.get_bit(bufData[0x8f], 5)) count += 1; // Tiny 5DT (3)
		if (this.get_bit(bufData[0x98], 4)) count += 1; // Oasis (1)
		if (this.get_bit(bufData[0x99], 2)) count += 1; // Hunky Chunky Barrel (1)
		if (this.get_bit(bufData[0x99], 3)) count += 1; // Hunky Chunky Barrel (2)
		if (this.get_bit(bufData[0x9c], 0)) count += 1; // Oasis (2)
		if (this.get_bit(bufData[0x9c], 4)) count += 1; // Hunky Chunky Barrel (3)
		if (this.get_bit(bufData[0x9c], 5)) count += 1; // W5 (1)
		if (this.get_bit(bufData[0x9c], 6)) count += 1; // W5 (2)
		if (this.get_bit(bufData[0x9c], 7)) count += 1; // W5 (3)
		if (this.get_bit(bufData[0x9d], 4)) count += 1; // Oasis (3)
		if (this.get_bit(bufData[0x9d], 5)) count += 1; // Oasis (4)
		if (this.get_bit(bufData[0xa3], 0)) count += 1; // W5 (4)
		if (this.get_bit(bufData[0xa3], 1)) count += 1; // W5 (5)
		return count;
	}

	aa_chunky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x81], 2)) count += 1; // Tiny Temple (1)
		if (this.get_bit(bufData[0x85], 0)) count += 1; // Tiny Temple (2)
		if (this.get_bit(bufData[0x86], 7)) count += 1; // Tiny Temple (3)
		if (this.get_bit(bufData[0x8e], 0)) count += 1; // 5DT (3)
		if (this.get_bit(bufData[0x8e], 1)) count += 1; // 5DT (4)
		if (this.get_bit(bufData[0x8f], 6)) count += 1; // 5DT (1)
		if (this.get_bit(bufData[0x8f], 7)) count += 1; // 5DT (2)
		if (this.get_bit(bufData[0x97], 0)) count += 1; // W5 (1)
		if (this.get_bit(bufData[0x97], 1)) count += 1; // W5 (2)
		if (this.get_bit(bufData[0x97], 2)) count += 1; // W5 (3)
		if (this.get_bit(bufData[0x97], 3)) count += 1; // W5 (4)
		if (this.get_bit(bufData[0x9a], 3)) count += 1; // Vulture Cage (1)
		if (this.get_bit(bufData[0x9d], 3)) count += 1; // Vulture Cage (2)
		if (this.get_bit(bufData[0x9e], 3)) count += 1; // Vulture Cage (3)
		if (this.get_bit(bufData[0x9e], 4)) count += 1; // Vulture Cage (4)
		if (this.get_bit(bufData[0xa3], 2)) count += 1; // Outside Tiny Temple (1)
		if (this.get_bit(bufData[0xa3], 3)) count += 1; // Outside Tiny Temple (2)
		if (this.get_bit(bufData[0xa3], 4)) count += 1; // Outside Tiny Temple (3)
		if (this.get_bit(bufData[0xa3], 5)) count += 1; // Outside Tiny Temple (4)
		return count;
	}

	// Frantic Factory Coins
	frf_dk_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xa1], 0)) count += 1; // R&D Lever (1)
		if (this.get_bit(bufData[0xa1], 1)) count += 1; // R&D Lever (2)
		if (this.get_bit(bufData[0xa2], 5)) count += 1; // Testing Room Stairs (1)
		if (this.get_bit(bufData[0xa2], 6)) count += 1; // Testing Room Stairs (2)
		if (this.get_bit(bufData[0xa2], 7)) count += 1; // R&D Lever (3)
		if (this.get_bit(bufData[0xa4], 0)) count += 1; // Shaft window (1)
		if (this.get_bit(bufData[0xa4], 1)) count += 1; // Shaft window (2)
		if (this.get_bit(bufData[0xa5], 7)) count += 1; // Shaft window (3)
		if (this.get_bit(bufData[0xa6], 7)) count += 1; // Testing Room Stairs (3)
		if (this.get_bit(bufData[0xb8], 5)) count += 1; // Numbers Game (1)
		if (this.get_bit(bufData[0xb8], 6)) count += 1; // Numbers Game (2)
		if (this.get_bit(bufData[0xb8], 7)) count += 1; // Numbers Game (3)
		if (this.get_bit(bufData[0xbd], 3)) count += 1; // Powershed
		return count;
	}

	frf_diddy_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xa2], 2)) count += 1; // Storage Room (1)
		if (this.get_bit(bufData[0xa8], 2)) count += 1; // Drop to Power Shed (1)
		if (this.get_bit(bufData[0xa8], 3)) count += 1; // Drop to Power Shed (2)
		if (this.get_bit(bufData[0xa9], 0)) count += 1; // Drop to Power Shed (3)
		if (this.get_bit(bufData[0xaa], 6)) count += 1; // Drop to Powershed (4)
		if (this.get_bit(bufData[0xaa], 7)) count += 1; // Drop to Powershed (5)
		if (this.get_bit(bufData[0xb1], 1)) count += 1; // R&D Pole (1)
		if (this.get_bit(bufData[0xb1], 2)) count += 1; // R&D Pole (2)
		if (this.get_bit(bufData[0xb1], 3)) count += 1; // R&D Pole (3)
		if (this.get_bit(bufData[0xb2], 7)) count += 1; // R&D Pole (4)
		if (this.get_bit(bufData[0xb3], 0)) count += 1; // Pole Above Snide's (1)
		if (this.get_bit(bufData[0xb3], 1)) count += 1; // Pole Above Snide's (2)
		if (this.get_bit(bufData[0xb3], 2)) count += 1; // Pole Above Snide's (3)
		if (this.get_bit(bufData[0xb3], 3)) count += 1; // Pole Above Snide's (4)
		if (this.get_bit(bufData[0xb3], 4)) count += 1; // Pole Above Snide's (5)
		if (this.get_bit(bufData[0xbe], 1)) count += 1; // Storage Room (2)
		if (this.get_bit(bufData[0xbe], 2)) count += 1; // Storage Room (3)
		if (this.get_bit(bufData[0xbe], 7)) count += 1; // R&D Pole (5)
		return count;
	}

	frf_lanky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xb0], 0)) count += 1; // R&D Pole (1)
		if (this.get_bit(bufData[0xb1], 4)) count += 1; // R&D Pole (2)
		if (this.get_bit(bufData[0xb1], 5)) count += 1; // R&D Pole (3)
		if (this.get_bit(bufData[0xb1], 6)) count += 1; // R&D Pole (4)
		if (this.get_bit(bufData[0xb1], 7)) count += 1; // R&D Pole (5)
		if (this.get_bit(bufData[0xb5], 0)) count += 1; // Testing Room Boxes (1)
		if (this.get_bit(bufData[0xb5], 1)) count += 1; // Testing Room Boxes (2)
		if (this.get_bit(bufData[0xb5], 2)) count += 1; // Testing Room Boxes (3)
		if (this.get_bit(bufData[0xb5], 3)) count += 1; // Testing Room Boxes (4)
		if (this.get_bit(bufData[0xb6], 5)) count += 1; // Production Room (1)
		if (this.get_bit(bufData[0xb6], 6)) count += 1; // Production Room (2)
		if (this.get_bit(bufData[0xb6], 7)) count += 1; // Production Room (3)
		if (this.get_bit(bufData[0xbc], 0)) count += 1; // Crusher Room (1)
		if (this.get_bit(bufData[0xbc], 1)) count += 1; // Crusher Room (2)
		if (this.get_bit(bufData[0xbd], 7)) count += 1; // Crusher Room (3)
		if (this.get_bit(bufData[0xbf], 3)) count += 1; // Storage Room Box (1)
		if (this.get_bit(bufData[0xbf], 4)) count += 1; // Storage Room Box (2)
		if (this.get_bit(bufData[0xbf], 5)) count += 1; // Storage Room Box (3)
		return count;
	}

	frf_tiny_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xa8], 0)) count += 1; // BP (1)
		if (this.get_bit(bufData[0xa8], 1)) count += 1; // BP (2)
		if (this.get_bit(bufData[0xa9], 2)) count += 1; // BP (3)
		if (this.get_bit(bufData[0xa9], 3)) count += 1; // BP (4)
		if (this.get_bit(bufData[0xa9], 5)) count += 1; // Zinger Pole (1)
		if (this.get_bit(bufData[0xa9], 7)) count += 1; // Zinger Pole (2)
		if (this.get_bit(bufData[0xac], 3)) count += 1; // Zinger Pole (3)
		if (this.get_bit(bufData[0xac], 4)) count += 1; // Zinger Pole (4)
		if (this.get_bit(bufData[0xac], 7)) count += 1; // Zinger Pole (5)
		if (this.get_bit(bufData[0xb1], 0)) count += 1; // BP (5)
		if (this.get_bit(bufData[0xb2], 0)) count += 1; // High W4 (1)
		if (this.get_bit(bufData[0xb2], 1)) count += 1; // High W4 (2)
		if (this.get_bit(bufData[0xb3], 5)) count += 1; // High W4 (3)
		if (this.get_bit(bufData[0xb3], 6)) count += 1; // High W4 (4)
		if (this.get_bit(bufData[0xb3], 7)) count += 1; // High W4 (5)
		if (this.get_bit(bufData[0xbe], 0)) count += 1; // Production Room (1)
		if (this.get_bit(bufData[0xbf], 6)) count += 1; // Production Room (2)
		if (this.get_bit(bufData[0xbf], 7)) count += 1; // Production Room (3)
		return count;
	}

	frf_chunky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xa2], 3)) count += 1; // Snide's (1)
		if (this.get_bit(bufData[0xa5], 2)) count += 1; // W1 (Storage Room) (1)
		if (this.get_bit(bufData[0xa5], 5)) count += 1; // W1 (Storage Room) (2)
		if (this.get_bit(bufData[0xa6], 4)) count += 1; // W1 (Storage Room) (3)
		if (this.get_bit(bufData[0xa6], 5)) count += 1; // W1 (Storage Room) (4)
		if (this.get_bit(bufData[0xa9], 1)) count += 1; // Hatch (1)
		if (this.get_bit(bufData[0xb8], 0)) count += 1; // R&D (1)
		if (this.get_bit(bufData[0xb8], 1)) count += 1; // R&D (2)
		if (this.get_bit(bufData[0xb8], 4)) count += 1; // W1 (Storage Room) (5)
		if (this.get_bit(bufData[0xb9], 0)) count += 1; // Snide's (2)
		if (this.get_bit(bufData[0xb9], 2)) count += 1; // Production Room (1)
		if (this.get_bit(bufData[0xb9], 3)) count += 1; // Production Room (2)
		if (this.get_bit(bufData[0xb9], 4)) count += 1; // Production Room (3)
		if (this.get_bit(bufData[0xb9], 5)) count += 1; // Production Room (4)
		if (this.get_bit(bufData[0xb9], 6)) count += 1; // R&D (3)
		if (this.get_bit(bufData[0xb9], 7)) count += 1; // R&D (4)
		if (this.get_bit(bufData[0xba], 0)) count += 1; // Testing Room Alcove (1)
		if (this.get_bit(bufData[0xba], 1)) count += 1; // Testing Room Alcove (2)
		if (this.get_bit(bufData[0xba], 2)) count += 1; // Testing Room Alcove (3)
		if (this.get_bit(bufData[0xba], 3)) count += 1; // Testing Room Alcove (4)
		if (this.get_bit(bufData[0xba], 7)) count += 1; // Snide's (3)
		if (this.get_bit(bufData[0xbe], 3)) count += 1; // Hatch (2)
		if (this.get_bit(bufData[0xbe], 4)) count += 1; // Hatch (3)
		if (this.get_bit(bufData[0xbe], 5)) count += 1; // Hatch (4)
		if (this.get_bit(bufData[0xbe], 6)) count += 1; // Hatch (5)
		if (this.get_bit(bufData[0xbf], 0)) count += 1; // Stash Snatch Area (1)
		if (this.get_bit(bufData[0xbf], 1)) count += 1; // Stash Snatch Area (2)
		if (this.get_bit(bufData[0xbf], 2)) count += 1; // Stash Snatch Area (3)
		return count;
	}

	// Gloomy Galleon Coins
	gg_dk_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xc0], 3)) count += 1; // Cactus Area (1)
		if (this.get_bit(bufData[0xc0], 4)) count += 1; // Cactus Area (2)
		if (this.get_bit(bufData[0xc0], 5)) count += 1; // Cactus Area (3)
		if (this.get_bit(bufData[0xc3], 6)) count += 1; // Cactus Area (4)
		if (this.get_bit(bufData[0xd2], 5)) count += 1; // Chest (1)
		if (this.get_bit(bufData[0xd2], 6)) count += 1; // Chest (2)
		if (this.get_bit(bufData[0xd2], 7)) count += 1; // Chest (3)
		if (this.get_bit(bufData[0xda], 3)) count += 1; // 5DS (1)
		if (this.get_bit(bufData[0xda], 4)) count += 1; // 5DS (2)
		if (this.get_bit(bufData[0xda], 5)) count += 1; // 5DS (3)
		if (this.get_bit(bufData[0xdd], 1)) count += 1; // Baboon Blast (1)
		if (this.get_bit(bufData[0xdd], 2)) count += 1; // Baboon Blast (2)
		return count;
	}

	gg_diddy_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xbc], 7)) count += 1; // Chest (1)
		if (this.get_bit(bufData[0xc0], 2)) count += 1; // Cranky (1)
		if (this.get_bit(bufData[0xc1], 0)) count += 1; // Cranky (2)
		if (this.get_bit(bufData[0xc1], 1)) count += 1; // Cranky (3)
		if (this.get_bit(bufData[0xc1], 2)) count += 1; // Cranky (4)
		if (this.get_bit(bufData[0xc1], 3)) count += 1; // Cranky (5)
		if (this.get_bit(bufData[0xc1], 4)) count += 1; // Chest (2)
		if (this.get_bit(bufData[0xc4], 0)) count += 1; // Cactus (1)
		if (this.get_bit(bufData[0xc4], 1)) count += 1; // Cactus (2)
		if (this.get_bit(bufData[0xc4], 2)) count += 1; // Seal Cage (1)
		if (this.get_bit(bufData[0xc4], 3)) count += 1; // Seal Cage (2)
		if (this.get_bit(bufData[0xc4], 4)) count += 1; // Seal Cage (3)
		if (this.get_bit(bufData[0xc5], 6)) count += 1; // Cactus (3)
		if (this.get_bit(bufData[0xc5], 7)) count += 1; // Cactus (4)
		if (this.get_bit(bufData[0xd1], 3)) count += 1; // Chest (3)
		return count;
	}

	gg_lanky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xc3], 2)) count += 1; // Enguarde Door (1)
		if (this.get_bit(bufData[0xc4], 6)) count += 1; // Enguarde Door (2)
		if (this.get_bit(bufData[0xcd], 0)) count += 1; // Enguarde Door (3)
		if (this.get_bit(bufData[0xce], 7)) count += 1; // Enguarde Box (1)
		if (this.get_bit(bufData[0xd1], 0)) count += 1; // Chest (1)
		if (this.get_bit(bufData[0xd1], 1)) count += 1; // Chest (2)
		if (this.get_bit(bufData[0xd1], 2)) count += 1; // Chest (3)
		if (this.get_bit(bufData[0xd4], 3)) count += 1; // 5DS (1)
		if (this.get_bit(bufData[0xd4], 4)) count += 1; // 5DS (2)
		if (this.get_bit(bufData[0xd6], 6)) count += 1; // 5DS (3)
		if (this.get_bit(bufData[0xd7], 1)) count += 1; // Enguarde Box (2)
		if (this.get_bit(bufData[0xd7], 2)) count += 1; // Enguarde Box (3)
		if (this.get_bit(bufData[0xde], 0)) count += 1; // 2DS (1)
		if (this.get_bit(bufData[0xde], 1)) count += 1; // 2DS (4)
		if (this.get_bit(bufData[0xdf], 6)) count += 1; // 2DS (2)
		if (this.get_bit(bufData[0xdf], 7)) count += 1; // 2DS (3)
		return count;
	}

	gg_tiny_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xc2], 7)) count += 1; // Outside Mermaid (1)
		if (this.get_bit(bufData[0xc3], 0)) count += 1; // Outside Mermaid (2)
		if (this.get_bit(bufData[0xc3], 1)) count += 1; // Outside Mermaid (3)
		if (this.get_bit(bufData[0xc3], 3)) count += 1; // Outside Mermaid (4)
		if (this.get_bit(bufData[0xc4], 5)) count += 1; // Outside Mermaid (5)
		if (this.get_bit(bufData[0xd2], 2)) count += 1; // Chest (1)
		if (this.get_bit(bufData[0xd2], 3)) count += 1; // Chest (2)
		if (this.get_bit(bufData[0xd2], 4)) count += 1; // Chest (3)
		if (this.get_bit(bufData[0xd3], 3)) count += 1; // Cannon Room (1)
		if (this.get_bit(bufData[0xd3], 4)) count += 1; // Cannon Room (2)
		if (this.get_bit(bufData[0xd3], 5)) count += 1; // Cannon Room (3)
		if (this.get_bit(bufData[0xd4], 5)) count += 1; // Pearls (1)
		if (this.get_bit(bufData[0xd4], 6)) count += 1; // Pearls (2)
		if (this.get_bit(bufData[0xd4], 7)) count += 1; // Pearls (3)
		if (this.get_bit(bufData[0xdb], 0)) count += 1; // Pearls (4)
		if (this.get_bit(bufData[0xdb], 1)) count += 1; // Inside Mermaid's Lair (1)
		if (this.get_bit(bufData[0xdb], 2)) count += 1; // Inside Mermaid's Lair (2)
		if (this.get_bit(bufData[0xdb], 3)) count += 1; // Inside Mermaid's Lair (3)
		if (this.get_bit(bufData[0xdb], 5)) count += 1; // 5DS (1)
		if (this.get_bit(bufData[0xdb], 6)) count += 1; // 5DS (2)    
		return count;
	}

	gg_chunky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xbc], 6)) count += 1; // Galleon: Chunky Coin OOB (1)
		if (this.get_bit(bufData[0xc0], 0)) count += 1; // Cranky Area (1)
		if (this.get_bit(bufData[0xc0], 1)) count += 1; // Cranky Area (2)
		if (this.get_bit(bufData[0xc3], 4)) count += 1; // Galleon: Chunky Coin OOB (2)
		if (this.get_bit(bufData[0xc3], 5)) count += 1; // Galleon: Chunky Coin OOB (3)
		if (this.get_bit(bufData[0xc8], 0)) count += 1; // Lighthouse W1 (1)
		if (this.get_bit(bufData[0xc8], 1)) count += 1; // Lighthouse W1 (2)
		if (this.get_bit(bufData[0xc8], 2)) count += 1; // Lighthouse W1 (3)
		if (this.get_bit(bufData[0xc8], 3)) count += 1; // Cannon Game (1)
		if (this.get_bit(bufData[0xc8], 4)) count += 1; // Cannon Game (2)
		if (this.get_bit(bufData[0xc8], 5)) count += 1; // Cannon Game (3)
		if (this.get_bit(bufData[0xd0], 0)) count += 1; // BP (1)
		if (this.get_bit(bufData[0xd0], 1)) count += 1; // Mermaid Tag Barrel (1)
		if (this.get_bit(bufData[0xd0], 2)) count += 1; // Mermaid Tag Barrel (2)
		if (this.get_bit(bufData[0xd0], 3)) count += 1; // Mermaid Tag Barrel (3)
		if (this.get_bit(bufData[0xd0], 4)) count += 1; // Mermaid Tag Barrel (4)
		if (this.get_bit(bufData[0xd0], 5)) count += 1; // Mermaid Tag Barrel (5)
		if (this.get_bit(bufData[0xd0], 6)) count += 1; // Cranky Area (3)
		if (this.get_bit(bufData[0xd1], 4)) count += 1; // BP (2)
		if (this.get_bit(bufData[0xd1], 5)) count += 1; // BP (3)
		if (this.get_bit(bufData[0xd1], 6)) count += 1; // BP (4)
		if (this.get_bit(bufData[0xd1], 7)) count += 1; // BP (5)
		if (this.get_bit(bufData[0xd5], 5)) count += 1; // 5DS (1)
		if (this.get_bit(bufData[0xd5], 6)) count += 1; // 5DS (2)
		if (this.get_bit(bufData[0xd5], 7)) count += 1; // 5DS (3)
		if (this.get_bit(bufData[0xd6], 3)) count += 1; // Ship (1)
		if (this.get_bit(bufData[0xd6], 4)) count += 1; // Ship (2)
		if (this.get_bit(bufData[0xd6], 5)) count += 1; // Ship (3)
		if (this.get_bit(bufData[0xd7], 3)) count += 1; // Lighthouse T&S (1)
		if (this.get_bit(bufData[0xd7], 4)) count += 1; // Lighthouse T&S (2)
		if (this.get_bit(bufData[0xd7], 5)) count += 1; // Lighthouse T&S (3)    
		return count;
	}

	// Fungi Forest Coins
	fuf_dk_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xe0], 0)) count += 1; // Near Baboon Blast (1)
		if (this.get_bit(bufData[0xe0], 1)) count += 1; // Near Baboon Blast (2)
		if (this.get_bit(bufData[0xe0], 2)) count += 1; // Behind Clock (1)
		if (this.get_bit(bufData[0xe0], 3)) count += 1; // Behind Clock (2)
		if (this.get_bit(bufData[0xe0], 4)) count += 1; // Behind Clock (3)
		if (this.get_bit(bufData[0xe1], 4)) count += 1; // Near Kasplat (1)
		if (this.get_bit(bufData[0xe1], 5)) count += 1; // Near Kasplat (2)
		if (this.get_bit(bufData[0xe1], 6)) count += 1; // Near Kasplat (3)
		if (this.get_bit(bufData[0xe1], 7)) count += 1; // Near Baboon Blast (3)
		if (this.get_bit(bufData[0xfb], 5)) count += 1; // DK Barn (1)
		if (this.get_bit(bufData[0xfb], 6)) count += 1; // DK Barn (2)
		if (this.get_bit(bufData[0xfb], 7)) count += 1; // DK Barn (3)    
		return count;
	}

	fuf_diddy_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xe4], 4)) count += 1; // Outside Mill (1)
		if (this.get_bit(bufData[0xe4], 5)) count += 1; // Outside Mill (2)
		if (this.get_bit(bufData[0xe4], 6)) count += 1; // Outside Mill (3)
		if (this.get_bit(bufData[0xe4], 7)) count += 1; // Battle Crown (1)
		if (this.get_bit(bufData[0xeb], 0)) count += 1; // Battle Crown (2)
		if (this.get_bit(bufData[0xeb], 1)) count += 1; // Battle Crown (3)
		if (this.get_bit(bufData[0xf0], 3)) count += 1; // Tree (1)
		if (this.get_bit(bufData[0xf0], 4)) count += 1; // Tree (2)
		if (this.get_bit(bufData[0xf4], 1)) count += 1; // Tree (3)
		if (this.get_bit(bufData[0xf4], 3)) count += 1; // Tree (4)
		if (this.get_bit(bufData[0xf4], 6)) count += 1; // Attic (1)
		if (this.get_bit(bufData[0xf4], 7)) count += 1; // Attic (2)
		if (this.get_bit(bufData[0xfb], 0)) count += 1; // Lanky Attic (1)
		if (this.get_bit(bufData[0xfb], 1)) count += 1; // Lanky Attic (2)
		if (this.get_bit(bufData[0xfb], 2)) count += 1; // Lanky Attic (3)    
		return count;
	}

	fuf_lanky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xed], 0)) count += 1; // Near Kasplat (1)
		if (this.get_bit(bufData[0xed], 1)) count += 1; // Near Kasplat (2)
		if (this.get_bit(bufData[0xed], 2)) count += 1; // Above Chunky Minecart (1)
		if (this.get_bit(bufData[0xed], 3)) count += 1; // Above Chunky Minecart (2)
		if (this.get_bit(bufData[0xed], 4)) count += 1; // Above Chunky Minecart (3)
		if (this.get_bit(bufData[0xee], 1)) count += 1; // Outside Barn (1)
		if (this.get_bit(bufData[0xee], 2)) count += 1; // Outside Barn (2)
		if (this.get_bit(bufData[0xee], 3)) count += 1; // Outside Barn (3)
		if (this.get_bit(bufData[0xee], 4)) count += 1; // Outside Giant Mushroom (1)
		if (this.get_bit(bufData[0xee], 5)) count += 1; // Outside Giant Mushroom (2)
		if (this.get_bit(bufData[0xee], 6)) count += 1; // Outside Giant Mushroom (3)
		if (this.get_bit(bufData[0xee], 7)) count += 1; // Near Kasplat (3)
		if (this.get_bit(bufData[0xfa], 2)) count += 1; // Mill (1)
		if (this.get_bit(bufData[0xfa], 3)) count += 1; // Mill (2)
		if (this.get_bit(bufData[0xfa], 4)) count += 1; // Mill (3)    
		return count;
	}

	fuf_tiny_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xeb], 2)) count += 1; // Near Kasplat (1)
		if (this.get_bit(bufData[0xeb], 3)) count += 1; // Near Kasplat (2)
		if (this.get_bit(bufData[0xeb], 4)) count += 1; // Near Kasplat (3)
		if (this.get_bit(bufData[0xeb], 5)) count += 1; // Near Kasplat (4)
		if (this.get_bit(bufData[0xf0], 0)) count += 1; // Purple Tunnel (1)
		if (this.get_bit(bufData[0xf0], 1)) count += 1; // Purple Tunnel (2)
		if (this.get_bit(bufData[0xf0], 2)) count += 1; // Purple Tunnel (3)
		if (this.get_bit(bufData[0xf0], 5)) count += 1; // Beanstalk (1)
		if (this.get_bit(bufData[0xf0], 6)) count += 1; // Beanstalk (2)
		if (this.get_bit(bufData[0xf0], 7)) count += 1; // Beanstalk (3)
		if (this.get_bit(bufData[0xf4], 2)) count += 1; // Near Kasplat (5)
		if (this.get_bit(bufData[0xfa], 5)) count += 1; // Mill (1)
		if (this.get_bit(bufData[0xfa], 6)) count += 1; // Mill (2)
		if (this.get_bit(bufData[0xfa], 7)) count += 1; // Mill (3)    
		return count;
	}

	fuf_chunky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0xf4], 0)) count += 1; // Well (1)
		if (this.get_bit(bufData[0xf5], 0)) count += 1; // Apple (1)
		if (this.get_bit(bufData[0xf5], 1)) count += 1; // Apple (2)
		if (this.get_bit(bufData[0xf5], 2)) count += 1; // Apple (3)
		if (this.get_bit(bufData[0xf5], 3)) count += 1; // Face Game (1)
		if (this.get_bit(bufData[0xf5], 4)) count += 1; // Face Game (2)
		if (this.get_bit(bufData[0xf5], 5)) count += 1; // Face Game (3)
		if (this.get_bit(bufData[0xf5], 6)) count += 1; // Well (2)
		if (this.get_bit(bufData[0xf5], 7)) count += 1; // Well (3)
		if (this.get_bit(bufData[0xf6], 5)) count += 1; // Outside Mill (1)
		if (this.get_bit(bufData[0xf6], 6)) count += 1; // Outside Mill (2)
		if (this.get_bit(bufData[0xf6], 7)) count += 1; // Outside Mill (3)
		if (this.get_bit(bufData[0xf9], 4)) count += 1; // Mill (1)
		if (this.get_bit(bufData[0xf9], 5)) count += 1; // Mill (2)
		if (this.get_bit(bufData[0xf9], 6)) count += 1; // Mill (3)    
		return count;
	}

	// Crystal Caves Coins
	cryc_dk_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x100], 0)) count += 1; // T&S Igloo (1)
		if (this.get_bit(bufData[0x100], 1)) count += 1; // T&S Igloo (2)
		if (this.get_bit(bufData[0x100], 2)) count += 1; // T&S Igloo (3)
		if (this.get_bit(bufData[0x101], 5)) count += 1; // Entrance Ice Wall (1)
		if (this.get_bit(bufData[0x101], 6)) count += 1; // Entrance Ice Wall (2)
		if (this.get_bit(bufData[0x101], 7)) count += 1; // Entrance Ice Wall (3)
		if (this.get_bit(bufData[0x114], 3)) count += 1; // Baboon Blast (1)
		if (this.get_bit(bufData[0x114], 7)) count += 1; // Baboon Blast (2)
		if (this.get_bit(bufData[0x116], 1)) count += 1; // DK Cabin (1)
		if (this.get_bit(bufData[0x116], 2)) count += 1; // DK Cabin (2)
		if (this.get_bit(bufData[0x11b], 0)) count += 1; // Baboon Blast (3)    
		return count;
	}

	cryc_diddy_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x105], 0)) count += 1; // Lanky Castle (1)
		if (this.get_bit(bufData[0x105], 1)) count += 1; // Lanky Castle (2)
		if (this.get_bit(bufData[0x105], 2)) count += 1; // Lanky Castle (3)
		if (this.get_bit(bufData[0x105], 3)) count += 1; // Lanky Castle (4)
		if (this.get_bit(bufData[0x115], 1)) count += 1; // Lower 5DC (1)
		if (this.get_bit(bufData[0x115], 2)) count += 1; // Lower 5DC (2)
		if (this.get_bit(bufData[0x115], 3)) count += 1; // Lower 5DC (3)
		if (this.get_bit(bufData[0x115], 4)) count += 1; // Lower 5DC (4)    
		return count;
	}

	cryc_lanky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x10d], 0)) count += 1; // 5DI Underwater (1)
		if (this.get_bit(bufData[0x10d], 1)) count += 1; // Near Lanky Cabin (1)
		if (this.get_bit(bufData[0x10d], 2)) count += 1; // Near Lanky Cabin (2)
		if (this.get_bit(bufData[0x10d], 3)) count += 1; // Near Lanky Cabin (3)
		if (this.get_bit(bufData[0x10d], 4)) count += 1; // Funky Underwater (1)
		if (this.get_bit(bufData[0x10d], 5)) count += 1; // Funky Underwater (2)
		if (this.get_bit(bufData[0x10d], 6)) count += 1; // Funky Underwater (3)
		if (this.get_bit(bufData[0x10e], 6)) count += 1; // 5DI Underwater (2)
		if (this.get_bit(bufData[0x10e], 7)) count += 1; // 5DI Underwater (3)
		if (this.get_bit(bufData[0x114], 0)) count += 1; // Ice Tomato (1)
		if (this.get_bit(bufData[0x114], 1)) count += 1; // Ice Tomato (2)    
		return count;
	}

	cryc_tiny_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x100], 7)) count += 1; // Giant Kosha (1)
		if (this.get_bit(bufData[0x106], 0)) count += 1; // Giant Kosha (2)
		if (this.get_bit(bufData[0x111], 0)) count += 1; // Funky (1)
		if (this.get_bit(bufData[0x112], 0)) count += 1; // Giant Kosha (3)
		if (this.get_bit(bufData[0x112], 1)) count += 1; // Air Coin by W1 (1)
		if (this.get_bit(bufData[0x112], 2)) count += 1; // Air Coin by W1 (2)
		if (this.get_bit(bufData[0x112], 3)) count += 1; // 5DI W3 (1)
		if (this.get_bit(bufData[0x112], 4)) count += 1; // 5DI W3 (2)
		if (this.get_bit(bufData[0x112], 5)) count += 1; // 5DI W3 (3)
		if (this.get_bit(bufData[0x112], 6)) count += 1; // Funky (2)
		if (this.get_bit(bufData[0x112], 7)) count += 1; // Funky (3)    
		return count;
	}

	cryc_chunky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x103], 3)) count += 1; // W3 (1)
		if (this.get_bit(bufData[0x106], 5)) count += 1; // Snide's (1)
		if (this.get_bit(bufData[0x106], 6)) count += 1; // Snide's (2)
		if (this.get_bit(bufData[0x106], 7)) count += 1; // Snide's (3)
		if (this.get_bit(bufData[0x108], 0)) count += 1; // Cranky Slope (1)
		if (this.get_bit(bufData[0x109], 0)) count += 1; // Candy Alcove (1)
		if (this.get_bit(bufData[0x109], 1)) count += 1; // Candy Alcove (2)
		if (this.get_bit(bufData[0x109], 2)) count += 1; // Candy Alcove (3)
		if (this.get_bit(bufData[0x109], 3)) count += 1; // Chunky Igloo (1)
		if (this.get_bit(bufData[0x109], 4)) count += 1; // Chunky Igloo (2)
		if (this.get_bit(bufData[0x109], 5)) count += 1; // Chunky Igloo (3)
		if (this.get_bit(bufData[0x109], 6)) count += 1; // Cranky Slope (2)
		if (this.get_bit(bufData[0x109], 7)) count += 1; // Cranky Slope (3)
		if (this.get_bit(bufData[0x113], 2)) count += 1; // W3 (2)
		if (this.get_bit(bufData[0x113], 5)) count += 1; // W3 (3)
		if (this.get_bit(bufData[0x113], 6)) count += 1; // W3 (4)
		if (this.get_bit(bufData[0x113], 7)) count += 1; // W3 (5)    
		return count;
	}

	// Creepy Castle Coins
	crec_dk_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x126], 0)) count += 1; // W2 (1)
		if (this.get_bit(bufData[0x126], 1)) count += 1; // W2 (2)
		if (this.get_bit(bufData[0x127], 4)) count += 1; // Tiny BP (1)
		if (this.get_bit(bufData[0x127], 5)) count += 1; // Tiny BP (2)
		if (this.get_bit(bufData[0x127], 6)) count += 1; // Tiny BP (3)
		if (this.get_bit(bufData[0x127], 7)) count += 1; // W2 (3)
		if (this.get_bit(bufData[0x132], 0)) count += 1; // Dungeon (1)
		if (this.get_bit(bufData[0x132], 1)) count += 1; // Dungeon (2)
		if (this.get_bit(bufData[0x132], 2)) count += 1; // Dungeon (3)
		if (this.get_bit(bufData[0x132], 3)) count += 1; // Dungeon (4)
		if (this.get_bit(bufData[0x134], 4)) count += 1; // Baboon Blast (1)
		if (this.get_bit(bufData[0x134], 5)) count += 1; // Baboon Blast (2)
		if (this.get_bit(bufData[0x134], 6)) count += 1; // Baboon Blast (3)
		if (this.get_bit(bufData[0x134], 7)) count += 1; // Baboon Blast (4)
		if (this.get_bit(bufData[0x13b], 0)) count += 1; // Baboon Blast (5)    
		return count;
	}

	crec_diddy_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x124], 1)) count += 1; // Drawbridge (1)
		if (this.get_bit(bufData[0x124], 2)) count += 1; // Drawbridge (2)
		if (this.get_bit(bufData[0x124], 3)) count += 1; // Drawbridge (3)
		if (this.get_bit(bufData[0x124], 5)) count += 1; // Near Drawbridge (1)
		if (this.get_bit(bufData[0x124], 6)) count += 1; // Near Drawbridge (2)
		if (this.get_bit(bufData[0x125], 7)) count += 1; // Drawbridge (4)
		if (this.get_bit(bufData[0x129], 3)) count += 1; // Coffin (1)
		if (this.get_bit(bufData[0x129], 4)) count += 1; // Coffin (2)
		if (this.get_bit(bufData[0x129], 5)) count += 1; // Coffin (3)
		if (this.get_bit(bufData[0x133], 4)) count += 1; // Dungeon Entrance (1)
		if (this.get_bit(bufData[0x133], 5)) count += 1; // Dungeon Entrance (2)
		if (this.get_bit(bufData[0x133], 6)) count += 1; // Dungeon Entrance (3)
		if (this.get_bit(bufData[0x134], 1)) count += 1; // Crypt (1)
		if (this.get_bit(bufData[0x134], 2)) count += 1; // Crypt (2)
		if (this.get_bit(bufData[0x134], 3)) count += 1; // Crypt (3)    
		return count;
	}

	crec_lanky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x125], 5)) count += 1; // Tree (1)
		if (this.get_bit(bufData[0x125], 6)) count += 1; // Tree (2)
		if (this.get_bit(bufData[0x12a], 1)) count += 1; // Orangstand GB (1)
		if (this.get_bit(bufData[0x12a], 2)) count += 1; // Orangstand GB (2)
		if (this.get_bit(bufData[0x12a], 3)) count += 1; // Orangstand GB (3)
		if (this.get_bit(bufData[0x131], 0)) count += 1; // Dungeon (1)
		if (this.get_bit(bufData[0x131], 1)) count += 1; // Dungeon (2)
		if (this.get_bit(bufData[0x132], 7)) count += 1; // Dungeon (3)
		if (this.get_bit(bufData[0x134], 0)) count += 1; // Crypt (1)
		if (this.get_bit(bufData[0x135], 5)) count += 1; // Crypt (2)
		if (this.get_bit(bufData[0x135], 6)) count += 1; // Crypt (3)
		if (this.get_bit(bufData[0x135], 7)) count += 1; // Crypt (4)
		if (this.get_bit(bufData[0x136], 0)) count += 1; // Greenhouse (1)
		if (this.get_bit(bufData[0x136], 1)) count += 1; // Greenhouse (2)
		if (this.get_bit(bufData[0x136], 2)) count += 1; // Greenhouse (3)    
		return count;
	}

	crec_tiny_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x126], 2)) count += 1; // Thin Tree (1)
		if (this.get_bit(bufData[0x126], 3)) count += 1; // Thin Tree (2)
		if (this.get_bit(bufData[0x126], 4)) count += 1; // Gravestone (1)
		if (this.get_bit(bufData[0x126], 5)) count += 1; // Gravestone (2)
		if (this.get_bit(bufData[0x126], 6)) count += 1; // Gravestone (3)
		if (this.get_bit(bufData[0x12a], 0)) count += 1; // Goo Hands (1)
		if (this.get_bit(bufData[0x12b], 0)) count += 1; // Ballroom (1)
		if (this.get_bit(bufData[0x12b], 1)) count += 1; // Ballroom (2)
		if (this.get_bit(bufData[0x12b], 2)) count += 1; // Ballroom (3)
		if (this.get_bit(bufData[0x12b], 7)) count += 1; // Goo Hands (2)
		if (this.get_bit(bufData[0x12f], 0)) count += 1; // Dungeon (1)
		if (this.get_bit(bufData[0x12f], 1)) count += 1; // Dungeon (2)
		if (this.get_bit(bufData[0x12f], 2)) count += 1; // Dungeon (3)
		if (this.get_bit(bufData[0x137], 0)) count += 1; // Trashcan (1)
		if (this.get_bit(bufData[0x137], 1)) count += 1; // Trashcan (2)    
		return count;
	}

	crec_chunky_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x125], 0)) count += 1; // Ledge (1)
		if (this.get_bit(bufData[0x125], 1)) count += 1; // Ledge (2)
		if (this.get_bit(bufData[0x125], 2)) count += 1; // Gravestone (1)
		if (this.get_bit(bufData[0x125], 3)) count += 1; // Gravestone (2)
		if (this.get_bit(bufData[0x125], 4)) count += 1; // Gravestone (3)
		if (this.get_bit(bufData[0x126], 7)) count += 1; // Ledge (3)
		if (this.get_bit(bufData[0x128], 2)) count += 1; // Museum (1)
		if (this.get_bit(bufData[0x128], 3)) count += 1; // Museum (2)
		if (this.get_bit(bufData[0x128], 4)) count += 1; // Museum (3)
		if (this.get_bit(bufData[0x129], 0)) count += 1; // Coffin (1)
		if (this.get_bit(bufData[0x129], 1)) count += 1; // Coffin (2)
		if (this.get_bit(bufData[0x12a], 7)) count += 1; // Coffin (3)
		if (this.get_bit(bufData[0x130], 0)) count += 1; // Tree (1)
		if (this.get_bit(bufData[0x130], 3)) count += 1; // Shed (1)
		if (this.get_bit(bufData[0x130], 4)) count += 1; // Shed (2)
		if (this.get_bit(bufData[0x130], 5)) count += 1; // Shed (3)
		if (this.get_bit(bufData[0x130], 6)) count += 1; // Shed (4)
		if (this.get_bit(bufData[0x131], 6)) count += 1; // Tree (2)
		if (this.get_bit(bufData[0x131], 7)) count += 1; // Tree (3)
		if (this.get_bit(bufData[0x132], 4)) count += 1; // Dungeon (1)
		if (this.get_bit(bufData[0x132], 5)) count += 1; // Dungeon (2)
		if (this.get_bit(bufData[0x132], 6)) count += 1; // Dungeon (3)
		if (this.get_bit(bufData[0x133], 1)) count += 1; // Candy (1)
		if (this.get_bit(bufData[0x133], 2)) count += 1; // Candy (2)
		if (this.get_bit(bufData[0x133], 3)) count += 1; // Candy (3)    
		return count;
	}

	// Training Grounds DK Coins
	tg_dk_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x13b], 1)) count += 1; // Right Tunnel 
		if (this.get_bit(bufData[0x13b], 2)) count += 1; // Center Tunnel
		if (this.get_bit(bufData[0x13b], 3)) count += 1; // Left Tunnel 
		return count;
	}

	// Rainbow Coins (All Kongs)
	rainbow_coins(bufData: Buffer): number {
		let count = 0;

		if (this.get_bit(bufData[0x4d], 5)) count += 5; // Jungle Japes Rainbow Coin (Slope by painting Room)
		if (this.get_bit(bufData[0x50], 6)) count += 5; // Angry Aztec 5DT Rainbow Coin
		if (this.get_bit(bufData[0x55], 5)) count += 5; // Angry Aztec Rainbow Coin
		if (this.get_bit(bufData[0x52], 5)) count += 5; // Frantic Factory Rainbow Coin
		if (this.get_bit(bufData[0x56], 6)) count += 5; // Gloomy Galleon Rainbow Coin (lighthouse)
		if (this.get_bit(bufData[0x55], 7)) count += 5; // Fungi Forest Rainbow Coin (near mill)
		if (this.get_bit(bufData[0x56], 2)) count += 5; // Fungi Forest Rainbow Coin (beanstalk)
		if (this.get_bit(bufData[0x57], 7)) count += 5; // Crystal Caves Rainbow Coin
		if (this.get_bit(bufData[0x59], 1)) count += 5; // Creepy Castle Rainbow Coin (Snide's)
		if (this.get_bit(bufData[0x54], 4)) count += 5; // DK Isles Rainbow Coin (Fungi Lobby Entrance)
		if (this.get_bit(bufData[0x54], 5)) count += 5; // DK Isles Rainbow Coin (Caves Early)
		if (this.get_bit(bufData[0x54], 6)) count += 5; // DK Isles Rainbow Coin (Aztec Lobby Roof)
		if (this.get_bit(bufData[0x59], 6)) count += 5; // DK Isles Rainbow Coin (K. Lumsy)
		if (this.get_bit(bufData[0x5c], 3)) count += 5; // DK Isles Rainbow Coin (Castle Lobby)
		if (this.get_bit(bufData[0x5c], 3)) count += 5; // DK Isles Rainbow Coin (Castle Lobby)
		if (this.get_bit(bufData[0x5b], 7)) count += 5; // Training Grounds Rainbow Coin (tunnel)
		if (this.get_bit(bufData[0x5c], 0)) count += 5; // Training Grounds Rainbow Coin (waterfall)
		return count;
	}

	delete_actor(ptr: number) {
		let n = this.ModLoader.emulator.rdramRead8(ptr + 0x47) | 0x08;
		this.ModLoader.emulator.rdramWrite8(ptr + 0x47, n);
	}

	handle_despawn_actors() {
		// Make sure we should activate this!
		if (!this.needDeleteActors) return;

		// Reset now in case net updates durring loop
		this.needDeleteActors = false;

		// Initializers
		let ptr = this.core.runtime.get_actor_array_ptr();
		let count = this.core.runtime.get_actor_count();
		//let level = this.curLevel;
		let subPtr: number;
		let id: number;
		let i: number;
		let val: number;
		let bit: number;

		// Get into first actor
		//ptr += 0x08;

		// Loop all actors
		for (i = 0; i < count; i++) {
			subPtr = this.ModLoader.emulator.dereferencePointer(ptr + (i * 4));
			id = this.ModLoader.emulator.rdramRead16(subPtr + 0x5A);

			switch (id) {
				case API.ActorType.RAINBOW_COIN_PATCH:
					break;

				default:
			}

			// Advance to next struct
			//ptr += 0x0180;
		}
	}

	check_voxel_flag(behaviorID: number) {
		let currentMap = this.core.runtime.current_map;
		let x: number;
		let id: number;

		for (x = 0; x < 0x70; x++) {
			let flagbase = 0x755A20 + x * 8;
			let map = this.ModLoader.emulator.rdramRead8(flagbase + 0);

			if (map === currentMap) {
				id = this.ModLoader.emulator.rdramRead16(flagbase + 2);

				if (id === behaviorID) {
					this.ModLoader.logger.info('[Despawner] Found ID:' + id + 's Flag!');

					let flagIndex = this.ModLoader.emulator.rdramRead16(flagbase + 4);
					let flagByte = Math.floor(flagIndex / 8);
					let flagBit = flagIndex % 8;

					if (this.get_bit(flagByte, flagIndex)) {
						return true;
					} else {
						this.ModLoader.logger.info('[Despawner] Flag was off! :(');
						break;
					}
				}
			}
		}

		return false;
	}

	handle_despawn_voxels() {
		// Make sure we should activate this!
		if (!this.needDeleteVoxels) return;

		// Reset now in case net updates during loop
		this.needDeleteVoxels = false;

		// Initializers
		let ptr = this.core.runtime.get_voxel_array_ptr();
		let count = this.core.runtime.get_voxel_count();
		let behaviorPtr: number;
		let behaviorID: number
		let modelPtr: number;
		let base: number
		let id: number;
		let i: number;

		if (ptr === 0) return;

		this.ModLoader.logger.info('[Despawner] Object Array Count: ' + count);

		// Loop all voxels
		for (i = 0; i < count; i++) {
			base = ptr + (i * 0x90);
			modelPtr = this.ModLoader.emulator.dereferencePointer(base + 0x20);
			behaviorPtr = this.ModLoader.emulator.dereferencePointer(base + 0x7C);
			id = this.ModLoader.emulator.rdramRead16(base + 0x84);
			behaviorID = this.ModLoader.emulator.rdramRead16(base + 0x84);
			this.ModLoader.logger.info('[Despawner] Object ID: ' + id);

			switch (id) {
				case API.VoxelType.GOLDEN_BANANA:
					this.ModLoader.logger.info('[Despawner] Found Golden Banana! Slot base: ' + base + ', Model Pointer: ' + modelPtr);
					this.ModLoader.emulator.rdramWrite8(base + 0x8C, 0x20);
					this.ModLoader.emulator.rdramWriteF32(modelPtr + 0x0C, 0.0);

					if (this.check_voxel_flag(behaviorID)) {
						if (modelPtr !== 0) {
							// This flag was already activated! Despawn it now!!!
							this.ModLoader.logger.info('[Despawner] Flag was on! Set Scale to 0! Current Scale is ' + this.ModLoader.emulator.rdramReadF32(modelPtr + 0x0C));
							this.ModLoader.emulator.rdramWrite8(base + 0x8C, 0);
							this.ModLoader.emulator.rdramWriteF32(modelPtr + 0x0C, 0.0);
							this.ModLoader.emulator.rdramWrite8(behaviorPtr + 0x60, 1);
							this.ModLoader.emulator.rdramWrite8(behaviorPtr + 0x54, 0);
							break;
						} else {
							this.ModLoader.logger.info('[Despawner] Model Pointer returned null..');
							break;
						}
					}
					break;

				case API.VoxelType.SINGLE_CB_DK:
					this.ModLoader.logger.info('[Despawner] Found DK CB Single Banana! Slot base: ' + base + ', Model Pointer: ' + modelPtr);

					if (this.check_voxel_flag(behaviorID)) {
						if (modelPtr !== 0) {
							// This flag was already activated! Despawn it now!!!
							this.ModLoader.logger.info('[Despawner] Flag was on! Set Scale to 0! Current Scale is ' + this.ModLoader.emulator.rdramReadF32(modelPtr + 0x0C));
							this.ModLoader.emulator.rdramWrite8(base + 0x8C, 128);
							this.ModLoader.emulator.rdramWriteF32(modelPtr + 0x0C, 0.0);
							break;
						} else {
							// This flag was already activated! Despawn it now!!!
							this.ModLoader.logger.info('[Despawner] Model Pointer returned null..');
							break;
						}
					}
					break;

				case API.VoxelType.BUNCH_CB_DK:
					this.ModLoader.logger.info('[Despawner] Found DK CB Bunch! Slot base: ' + base + ', Model Pointer: ' + modelPtr);

					if (this.check_voxel_flag(behaviorID)) {
						if (modelPtr !== 0) {
							// This flag was already activated! Despawn it now!!!
							this.ModLoader.logger.info('[Despawner] Flag was on! Set Scale to 0! Current Scale is ' + this.ModLoader.emulator.rdramReadF32(modelPtr + 0x0C));
							this.ModLoader.emulator.rdramWrite8(base + 0x8C, 128);
							this.ModLoader.emulator.rdramWriteF32(modelPtr + 0x0C, 0.0);
							break;
						} else {
							// This flag was already activated! Despawn it now!!!
							this.ModLoader.logger.info('[Despawner] Model Pointer returned null..');
							break;
						}
					}
					break;

				case API.VoxelType.BC_DK:
					this.ModLoader.logger.info('[Despawner] Found DK Banana Coin! Slot base: ' + base + ', Model Pointer: ' + modelPtr);

					if (this.check_voxel_flag(behaviorID)) {
						if (modelPtr !== 0) {
							// This flag was already activated! Despawn it now!!!
							this.ModLoader.logger.info('[Despawner] Flag was on! Set Scale to 0! Current Scale is ' + this.ModLoader.emulator.rdramReadF32(modelPtr + 0x0C));
							this.ModLoader.emulator.rdramWrite8(base + 0x8C, 128);
							this.ModLoader.emulator.rdramWriteF32(modelPtr + 0x0C, 0.0);
							break;
						} else {
							// This flag was already activated! Despawn it now!!!
							this.ModLoader.logger.info('[Despawner] Model Pointer returned null..');
							break;
						}
					}
					break;

				default:
			}
		}
	}

	constructor() { }

	preinit(): void { }

	init(): void { }

	postinit(): void { }

	onTick(): void {
		//if (this.skipStartupOn) {
		//if (this.skipTickCount === 140) {
		//this.core.runtime.dest_map = 0x50;
		//let voidByteValue = this.ModLoader.emulator.rdramRead8(0x7FBB62);
		//voidByteValue |= 1 << 0;
		//this.ModLoader.emulator.rdramWrite8(0x7FBB62, voidByteValue);
		//this.core.runtime.game_mode = 0x5;
		//this.ModLoader.emulator.rdramWrite16(0x755308, 0xFFFF);
		//this.skipStartupOn = false;
		//}

		//this.skipTickCount += 1;
		//}

		if (!this.core.isPlaying()) return;

		// Initializers
		let profile = this.core.runtime.current_profile;
		let bufStorage: Buffer;
		let bufData: Buffer;

		// First time storage
		//if (!this.firstTimeSendStorage) {
		//this.send_storage(bufData!, bufStorage!, profile);
		//}

		// Player Handlers
		this.handle_player();

		// Flag Handlers
		this.handle_game_flags(bufData!, bufStorage!, profile);
		this.handle_temp_flags(bufData!, bufStorage!);

		// Despawners
		//this.handle_despawn_actors();
		//this.handle_despawn_voxels();
	}

	@EventHandler(EventsClient.ON_INJECT_FINISHED)
	onClient_InjectFinished(evt: any) {

	}

	@EventHandler(EventsServer.ON_LOBBY_CREATE)
	onServer_LobbyCreate(lobby: string) {
		this.ModLoader.lobbyManager.createLobbyStorage(lobby, this, new Net.DatabaseServer());
	}

	@EventHandler(EventsClient.CONFIGURE_LOBBY)
	onLobbySetup(lobby: LobbyData): void {
		// Can set configurable settings for a host of
		// lobby to set for a play session. EX: combination with
		// below On_Lobby_Join event.

		// lobby.data['Dk64Online:data1_syncing'] = true;
		// lobby.data['Dk64Online:data2_syncing'] = true;
	}

	@EventHandler(EventsClient.ON_LOBBY_JOIN)
	onClient_LobbyJoin(lobby: LobbyData): void {
		this.db = new Net.DatabaseClient();
		let pData = new Packet('Request_Storage', 'Dk64Online', this.ModLoader.clientLobby, false);
		this.ModLoader.clientSide.sendPacket(pData);
	}

	@EventHandler(EventsServer.ON_LOBBY_JOIN)
	onServer_LobbyJoin(evt: EventServerJoined) { }

	@EventHandler(EventsServer.ON_LOBBY_LEAVE)
	onServer_LobbyLeave(evt: EventServerLeft) {
		let storage: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(evt.lobby, this) as Net.DatabaseServer;
	}

	@EventHandler(EventsClient.ON_SERVER_CONNECTION)
	onClient_ServerConnection(evt: any) { }

	@EventHandler(EventsClient.ON_PLAYER_JOIN)
	onClient_PlayerJoin(nplayer: INetworkPlayer) { }

	@EventHandler(EventsClient.ON_PLAYER_LEAVE)
	onClient_PlayerLeave(nplayer: INetworkPlayer) { }

	// #################################################
	// ##  Server Receive Packets
	// #################################################

	@ServerNetworkHandler('Request_Storage')
	onServer_RequestStorage(packet: Packet): void {
		this.ModLoader.logger.info('[Server] Sending: {Lobby Storage}');
		let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Safety check
        if (sDB === null) return;

		let pData = new Net.SyncStorage(packet.lobby, sDB.game_flags, sDB.kong);
		this.ModLoader.serverSide.sendPacketToSpecificPlayer(pData, packet.player);
	}

	@ServerNetworkHandler('SyncGameFlags')
	onServer_SyncGameFlags(packet: Net.SyncBuffered) {
		this.ModLoader.logger.info('[Server] Received: {Game Flags}');

		let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Safety check
        if (sDB === null) return;

		let data: Buffer = sDB.game_flags;
		let count: number = data.byteLength;
		let i = 0;
		let needUpdate = false;

		for (i = 0; i < count; i++) {
			if (data[i] === packet.value[i]) continue;

			data[i] |= packet.value[i];
			needUpdate = true;
		}

		if (!needUpdate) return;

		sDB.game_flags = data;

		let pData = new Net.SyncBuffered(packet.lobby, 'SyncGameFlags', data, true);
		this.ModLoader.serverSide.sendPacket(pData);

		this.ModLoader.logger.info('[Server] Updated: {Game Flags}');
	}

	@ServerNetworkHandler('SyncTempFlags')
	onServer_SyncTempFlags(packet: Net.SyncBuffered) {
		this.ModLoader.logger.info('[Server] Received: {Temp Flags}');

		let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Safety check
        if (sDB === null) return;

		let data: Buffer = sDB.temp_flags;
		let count: number = data.byteLength;
		let i = 0;
		let needUpdate = false;

		for (i = 0; i < count; i++) {
			if (data[i] === packet.value[i]) continue;

			data[i] |= packet.value[i];
			needUpdate = true;
		}

		if (!needUpdate) return;

		sDB.temp_flags = data;

		let pData = new Net.SyncBuffered(packet.lobby, 'SyncTempFlags', data, true);
		this.ModLoader.serverSide.sendPacket(pData);
		this.ModLoader.logger.info('[Server] Updated: {Temp Flags}');
	}

	@ServerNetworkHandler('SyncKong')
	onServer_SyncKong(packet: Net.SyncKong) {
		this.ModLoader.logger.info('[Server] Received: {Kong Data}');

		let sDB: Net.DatabaseServer = this.ModLoader.lobbyManager.getLobbyStorage(packet.lobby, this) as Net.DatabaseServer;

        // Safety check
        if (sDB === null) return;

		let index: number = packet.kong_index;
		let data = sDB.kong[index] as Net.KongData;
		let needUpdate = false;

		// Update moves
		if (data.moves < packet.kong.moves) {
			data.moves = packet.kong.moves;
			needUpdate = true;
		}

		// Update simian slam
		if (data.simian_slam < packet.kong.simian_slam) {
			data.simian_slam = packet.kong.simian_slam;
			needUpdate = true;
		}

		// Update weapon
		if (data.weapon < packet.kong.weapon) {
			data.weapon = packet.kong.weapon;
			needUpdate = true;
		}

		// Update ammo belt
		if (data.ammo_belt < packet.kong.ammo_belt) {
			data.ammo_belt = packet.kong.ammo_belt;
			needUpdate = true;
		}

		// Update instrument
		if (data.instrument < packet.kong.instrument) {
			data.instrument = packet.kong.instrument;
			needUpdate = true;
		}

		// Update Troff n Scoff Totals
		// Jungle Japes
		if (data.tns_bananas.jungle_japes < packet.kong.tns_bananas.jungle_japes) {
			data.tns_bananas.jungle_japes = packet.kong.tns_bananas.jungle_japes;
			needUpdate = true;
		}

		// Angry Aztec
		if (data.tns_bananas.angry_aztec < packet.kong.tns_bananas.angry_aztec) {
			data.tns_bananas.angry_aztec = packet.kong.tns_bananas.angry_aztec;
			needUpdate = true;
		}

		// Frantic Factory
		if (data.tns_bananas.frantic_factory < packet.kong.tns_bananas.frantic_factory) {
			data.tns_bananas.frantic_factory = packet.kong.tns_bananas.frantic_factory;
			needUpdate = true;
		}

		// Gloomy Galleon
		if (data.tns_bananas.gloomy_galleon < packet.kong.tns_bananas.gloomy_galleon) {
			data.tns_bananas.gloomy_galleon = packet.kong.tns_bananas.gloomy_galleon;
			needUpdate = true;
		}

		// Fungi Forest
		if (data.tns_bananas.fungi_forest < packet.kong.tns_bananas.fungi_forest) {
			data.tns_bananas.fungi_forest = packet.kong.tns_bananas.fungi_forest;
			needUpdate = true;
		}

		// Crystal Caves
		if (data.tns_bananas.crystal_caves < packet.kong.tns_bananas.crystal_caves) {
			data.tns_bananas.crystal_caves = packet.kong.tns_bananas.crystal_caves;
			needUpdate = true;
		}

		// Creepy Castle
		if (data.tns_bananas.creepy_castle < packet.kong.tns_bananas.creepy_castle) {
			data.tns_bananas.creepy_castle = packet.kong.tns_bananas.creepy_castle;
			needUpdate = true;
		}

		if (!needUpdate) return;
		sDB.kong[index] = data;
		let pData = new Net.SyncKong(packet.lobby, sDB.kong[index], index, true);
		this.ModLoader.serverSide.sendPacket(pData);

		this.ModLoader.logger.info('[Server] Updated: {Kong Data}');
	}

	// #################################################
	// ##  Client Receive Packets
	// #################################################

	@NetworkHandler('SyncStorage')
	onClient_SyncStorage(packet: Net.SyncStorage): void {
		this.ModLoader.logger.info('[Client] Received: {Lobby Storage}');
		this.db.game_flags = packet.game_flags;
		this.db.kong = packet.kong;

		// Enable intro skip.
		//this.ModLoader.emulator.rdramWrite8(0x74452c, 1);
	}

	@NetworkHandler('SyncGameFlags')
	onClient_SyncGameFlags(packet: Net.SyncBuffered) {
		this.ModLoader.logger.info('[Client] Received: {Game Flags}');

		let data: Buffer = this.db.game_flags;
		let count: number = data.byteLength;
		let i = 0;
		let needUpdate = false;

		for (i = 0; i < count; i++) {
			if (data[i] === packet.value[i]) continue;

			data[i] |= packet.value[i];
			needUpdate = true;
		}

		if (!needUpdate) return;
		this.db.game_flags = data;
		this.ModLoader.logger.info('[Client] Updated: {Game Flags}');
	}

	@NetworkHandler('SyncTempFlags')
	onClient_SyncTempFlags(packet: Net.SyncBuffered) {
		this.ModLoader.logger.info('[Client] Received: {Temp Flags}');

		let data: Buffer = this.db.temp_flags;
		let count: number = data.byteLength;
		let i = 0;
		let needUpdate = false;

		for (i = 0; i < count; i++) {
			if (data[i] === packet.value[i]) continue;

			data[i] |= packet.value[i];
			needUpdate = true;
		}

		if (!needUpdate) return;
		this.db.temp_flags = data;
		this.ModLoader.logger.info('[Client] Updated: {Temp Flags}');
	}

	@NetworkHandler('SyncKong')
	onClient_SyncKong(packet: Net.SyncKong) {
		this.ModLoader.logger.info('[Client] Received: {Kong Data}');

		let index: number = packet.kong_index;
		let data = this.db.kong[index] as Net.KongData;
		let i = 0;
		let needUpdate = false;

		// Update moves
		if (data.moves < packet.kong.moves) {
			data.moves = packet.kong.moves;
			needUpdate = true;
		}

		// Update simian slam
		if (data.simian_slam < packet.kong.simian_slam) {
			data.simian_slam = packet.kong.simian_slam;
			needUpdate = true;
		}

		// Update weapon
		if (data.weapon < packet.kong.weapon) {
			data.weapon = packet.kong.weapon;
			needUpdate = true;
		}

		// Update ammo belt
		if (data.ammo_belt < packet.kong.ammo_belt) {
			data.ammo_belt = packet.kong.ammo_belt;
			needUpdate = true;
		}

		// Update instrument
		if (data.instrument < packet.kong.instrument) {
			data.instrument = packet.kong.instrument;
			needUpdate = true;
		}

		// Update Troff n Scoff Totals
		// Jungle Japes
		if (data.tns_bananas.jungle_japes < packet.kong.tns_bananas.jungle_japes) {
			data.tns_bananas.jungle_japes = packet.kong.tns_bananas.jungle_japes;
			needUpdate = true;
		}

		// Angry Aztec
		if (data.tns_bananas.angry_aztec < packet.kong.tns_bananas.angry_aztec) {
			data.tns_bananas.angry_aztec = packet.kong.tns_bananas.angry_aztec;
			needUpdate = true;
		}

		// Frantic Factory
		if (data.tns_bananas.frantic_factory < packet.kong.tns_bananas.frantic_factory) {
			data.tns_bananas.frantic_factory = packet.kong.tns_bananas.frantic_factory;
			needUpdate = true;
		}

		// Gloomy Galleon
		if (data.tns_bananas.gloomy_galleon < packet.kong.tns_bananas.gloomy_galleon) {
			data.tns_bananas.gloomy_galleon = packet.kong.tns_bananas.gloomy_galleon;
			needUpdate = true;
		}

		// Fungi Forest
		if (data.tns_bananas.fungi_forest < packet.kong.tns_bananas.fungi_forest) {
			data.tns_bananas.fungi_forest = packet.kong.tns_bananas.fungi_forest;
			needUpdate = true;
		}

		// Crystal Caves
		if (data.tns_bananas.crystal_caves < packet.kong.tns_bananas.crystal_caves) {
			data.tns_bananas.crystal_caves = packet.kong.tns_bananas.crystal_caves;
			needUpdate = true;
		}

		// Creepy Castle
		if (data.tns_bananas.creepy_castle < packet.kong.tns_bananas.creepy_castle) {
			data.tns_bananas.creepy_castle = packet.kong.tns_bananas.creepy_castle;
			needUpdate = true;
		}

		if (!needUpdate) return;
		this.db.kong[index] = data;

		this.ModLoader.logger.info('[Client] Updated: {Kong Data}');
	}
}
