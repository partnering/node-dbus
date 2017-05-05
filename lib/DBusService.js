'use strict';

const debug          = require ('debug')('dbus-native:DBusService')
const utils          = require ('./utils.js')
const Errors         = require ('./Errors.js')
const inspect        = require ('util').inspect
const Promise        = require ('bluebird')
const DBusObjectLibs = require ('./DBusObjectLibs.js')

const DBusObject = DBusObjectLibs.DBusObject

/** @module DBusService */

/**
 * Represent a DBus service that we want to expose on a DBus bus.<br>
 * We can directly pass it a {@link DBusObject} or add one later with @{link addObject}
 * @param {DBusObject} [obj]          The DBusObject to add as a root object
 * @param {string}      [relativePath] The relative path at which add the object passed in first parameter
 */
function DBusService (obj, relativePath) {
	/**
	 * Create an empty DBusObject at location '/' to represent the root object.<br>
	 * 'relativePath' will be relative to this '/' root
	 */
	this['/'] = new DBusObject()

	// If we have a 'DBusObject' and a 'relativePath', try adding it
	if (typeof obj !== 'undefined' && typeof relativePath !== 'undefined')
		this.addObject (obj, relativePath)

	/**
	 * The service name, as seen on the bus.<br>
	 * Will be populated by {@link module:Bus#exposeService}
	 * @type {string}
	 */
	this.name = undefined

	/**
	 * The bus on which the service is exposed.<br>
	 * Will be populated by {@link module:Bus#exposeService}
	 * @type {Object}
	 */
	this.bus = undefined
}

DBusService.prototype.addObject = function (object = mandatory(), relativePath = mandatory()) {
	this['/'].addObject (object, relativePath)
}

DBusService.prototype.removeObject = function (objPath = mandatory()) {
	debug(`objPath: ${objPath}`)
	let pathComponents
	let child

	// Only an absolute path can be supplied to 'removeObject()' if called directly on the Service
	if (!objPath.startsWith('/')) {
		throw new Error(`You must supply an absolute path when calling 'removeObject()' from the service!`)
	}

	pathComponents = objPath.split('/').splice(1)

	return this['/'].removeObject(pathComponents.join('/'))
}


module.exports = DBusService
