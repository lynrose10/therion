import _ from "lodash";
import pluralize from "pluralize";
import debug from "debug";

import Action from "../resolvers/Action";

const log = debug("therion:server:Controller");

class Controller {
	constructor(model, modelDef) {
		this._model = model;
		this._modelDef = modelDef;
	}

	get model() {
		return this._model;
	}

	_obj = (method) => (this[method] ? this : this._model);

	getQuery = () => {
		const query = {};
		const modelName = _.camelCase(this._model.name);
		const modelDef = this._modelDef;

		query[`${ modelName }`] = async (obj, args) => {
			let record;

			if (args.id) {
				record = await this._obj("findById").findById(args.id);
			} else {
				const { where="{}", options="{}" } = args;

				args.where = JSON.parse(where);
				delete args.options;
				_.assign(args, JSON.parse(options));
				args.include = Object.keys(modelDef.associations);

				record = await this._obj("findOne").findOne(args);
			}

			log(record);
			return record;
		};

		query[`${ pluralize.plural(modelName) }`] = async (obj, args) => {
			let count, rows;
			const { action, offset, limit, where="{}", options="{}" } = args;

			args.where = JSON.parse(where);
			delete args.options;
			_.assign(args, JSON.parse(options));
			args.include = Object.keys(modelDef.associations);

			if (action === Action.COUNT) {
				const result = await this._obj("findAndCountAll").findAndCountAll(args);

				count = result.count;
				rows = result.rows;
			} else {
				rows = await this._obj("findAll").findAll(args);
			}

			log(rows);
			return {
				offset,
				limit,
				count,
				rows,
			};
		};

		return query;
	}

	getMutation = () => {
		const mutation = {};
		const modelName = _.camelCase(this._model.name);
		const modelDef = this._modelDef;

		mutation[`${ modelName }`] = async (obj, args) => {
			let record;

			try {
				const { action, values: v="{}", options: o="{}" } = args;
				const values = JSON.parse(v);
				const options = JSON.parse(o);

				options.include = Object.keys(modelDef.associations);
				log(options);

				switch (action) {
				case Action.CREATE:
				default: {
					await this._obj("create").create(values, options);

					// Make sure it returns the newly created record
					options.returning = true;
					break;
				}
				case Action.READ: {
					const [ r ] = await this._obj("findOrCreate").findOrCreate(options);

					record = r;
					break;
				}
				case Action.UPSERT: {
					await this._obj("upsert").upsert(values, options);

					// Do not auto fetch record from database since it might return the wrong one
					options.returning = false;
					break;
				}
				case Action.UPDATE: {
					const { include } = options;

					delete options.include;
					options.limit = 1;
					const [ affectedRows, affectedCount ] = await this._obj("update").update(values, options);

					options.include = include;

					if (affectedCount && affectedRows) {
						record = affectedRows[0];
					}
					break;
				}
				case Action.DELETE: {
					if (options.returning) {
						record = await this._obj("findOne").findOne(options);
					}

					await this._obj("destroy").destroy(options);

					// Do not auto fetch the record from database since it is already non existent
					options.returning = false;
					break;
				}}

				if (!record && options.returning) {
					record = await this._obj("findOne").findOne(options);
				}
			} catch (e) {
				log(e);

				record = null;
			}

			log(record);
			return record;
		};

		mutation[`${ pluralize.plural(modelName) }`] = async (obj, args) => {
			let count, rows;

			try {
				const { action, values: v="{}", options: o="{}" } = args;
				const values = JSON.parse(v);
				const options = JSON.parse(o);

				options.include = Object.keys(modelDef.associations);

				switch (action) {
				case Action.CREATE:
					rows = await this._obj("bulkCreate").update(values, options);
					count = rows.length;
					break;
				case Action.READ:
				case Action.UPSERT:
				default:
					// Do nothing since it's not meaningful to do these operations on multiple records
					return null;
				case Action.UPDATE: {
					const { include } = options;

					delete options.include;
					const [ affectedRows, affectedCount ] = await this._obj("update").update(values, options);

					options.include = include;
					
					count = affectedCount;
					rows = affectedRows;
					break;
				}
				case Action.DELETE: {
					if (options.returning) {
						rows = await this._obj("findAll").findAll(options);
						count = rows.length;
					}

					count = await this._obj("destroy").destroy(options);
					break;
				}}

				log(rows);
				if (!rows && options.returning) {
					rows = await this._obj("findAll").findAll(options);
					count = rows.length;
				}
			} catch (e) {
				log(e);

				count = null;
				rows = null;
			}

			log(rows);
			return {
				count,
				rows,
			};
		};

		return mutation;
	}

	getQuerySchema = () => {
		const model = this._model;
		const modelName = _.camelCase(model.name);
		const formalModelName = _.upperFirst(model.name);

		return `
			${ modelName }(action: Action, where: Json, offset: Int, limit: Int, sort: String, id: Int, options: Json): ${ formalModelName }
			${ pluralize.plural(modelName) }(action: Action, where: Json, offset: Int, limit: Int, sort: String, options: Json): ${ formalModelName }WithCount
		`;
	}

	getMutationSchema = () => {
		const model = this._model;
		const modelName = _.camelCase(model.name);
		const formalModelName = _.upperFirst(model.name);

		return `
			${ modelName }(action: Action, values: Json, options: Json): ${ formalModelName }
			${ pluralize.plural(modelName) }(action: Action, values: Json, options: Json): ${ formalModelName }WithCount
		`;
	}
}

export default Controller;
