export class Database {
	game_flags: Buffer = Buffer.alloc(0x013c);
	temp_flags: Buffer = Buffer.alloc(0x10);
	kong: KongData[] = new Array<KongData>();

	constructor() {
		let i: number;
		for (i = 0; i < 6; i++)
			this.kong.push(new KongData);
	}
}

export class DatabaseClient extends Database { }

export class DatabaseServer extends Database { }

export class KongData {
	moves: number = 0;
	simian_slam: number = 0;
	weapon: number = 0;
	ammo_belt: number = 0;
	instrument: number = 0;
	coins: number = 0;
	instrument_energy: number = 0;
	tns_bananas: BananaData = new BananaData;
}

export class BananaData {
	jungle_japes: number = 0;
	angry_aztec: number = 0;
	frantic_factory: number = 0;
	gloomy_galleon: number = 0;
	fungi_forest: number = 0;
	crystal_caves: number = 0;
	creepy_castle: number = 0;
	dk_isles: number = 0
	hideout_helm: number = 0;
	unknown_1: number = 0;
	unknown_2: number = 0;
	unknown_3: number = 0;
	unknown_4: number = 0;
	null: number = 0;
}