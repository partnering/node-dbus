'use strict';

const dbus    = require ('dbus-native')
const inspect = require ('util').inspect
const Promise = require ('bluebird')

const DBusInterfaceLibs = dbus.DBusInterfaceLibs

const t = dbus.type

const DBusMethod    = DBusInterfaceLibs.DBusMethod
const DBusSignal    = DBusInterfaceLibs.DBusSignal
const DBusProperty  = DBusInterfaceLibs.DBusProperty
const DBusInterface = DBusInterfaceLibs.DBusInterface

/** @module Server */

/**
 * @class
 * The Server interface is a simple interfa e for the example that shows how to use DBusProxy.
 * The service contains two methods:
 * - GiveDate() which returns the current date. A boolean parameter ('pretty') controls whether the returned date is in pretty format or not.
 * - Add() which adds two integers numbers
 * The service contains two properties:
 * - NbCalls which is readonly (cannot be modified) and record the total number of function calls that were ever made (we make sure to increment this number in each of the methods)
 * - Name which is a string that contain some name, it can be modified
 * The service contains one signal, 'FiveCalls' which fires everytime the total number of method calls is a multiple of 5, this signal carries one argument (value) that is the total number of function calls
 *
 * The second objective is to show that all method call are promisified
 */
class Server extends DBusInterface {
	constructor (...args) {
		super (...args)

		// Don't forget to set actual property values!

		/**
		 * Saves the total number of function call
		 * @type {Number}
		 */
		this.NbCalls = 0

		/**
		 * An arbitrary name
		 * @type {string}
		 */
		this.Name = 'Initial name'


		/*
			Signal which tells when this Interface will actually be exposed on the bus by the service.
			Since interfaces are created separately, then added to objects in services, if some functions
			in the interface need to make DBus proxies (or make other DBus calls), they need to know when they have
			access to the bus.
			This is where this signal comes handy. A reference to the DBusService that exposed this interface
			is passed as an argument, the interface can use it to make function calls to other methods in the service,
			or use the service's DBus connection.
		*/
		this.on ('ExposedOnBus', service => {
			/*
				'service' is an instance of DBusService
				'service.bus' is a reference to the bus, use 'service.bus.mkProxy()' to create a DBusProxy if you need
			*/
		})
	}

	/**
	 * Returns the current date.
	 * @param {boolean} pretty - Whether to return the current date in a pretty format or not
	 * @returns {string} The current date
	 */
	GiveDate (pretty) {
		return Promise.try( _ => {
			return this._updateNbCalls()
		})
		.then( _ => {
			if (pretty) {
				const now = new Date()

				return now.toString()
			} else {
				return Date.now().toString()
			}
		})
	}

	/**
	 * Add two numbers and return their sum.
	 * @param {Number} a
	 * @param {Number} b
	 * @returns {Number} a+b
	 */
	Add (a, b) {
		return Promise.try( _ => {
			return this._updateNbCalls()
		})
		.then( _ => {
			return a+b
		})
	}

	/**
	 * Increment the property `NbCalls` and if the value is a multiple of 5, fire a the `FiveCalls` signal
	 */
	_updateNbCalls() {
		return Promise.try( _ => {
			this.NbCalls += 1;

			if (this.NbCalls % 5 === 0)
				this.emit('FiveCalls', this.NbCalls)
		})
	}
}

/*
 __  __      _   _               _
|  \/  | ___| |_| |__   ___   __| |___
| |\/| |/ _ \ __| '_ \ / _ \ / _` / __|
| |  | |  __/ |_| | | | (_) | (_| \__ \
|_|  |_|\___|\__|_| |_|\___/ \__,_|___/
*/

DBusMethod (Server, 'GiveDate', {
	input: [
		{pretty: t.DBUS_BOOL},
	],
	output: [
		{date: t.DBUS_STRING},
	],
})

DBusMethod (Server, 'Add', {
	input: [
		{a: t.DBUS_INT32},
		{b: t.DBUS_INT32},
	],
	output: [
		{sum: t.DBUS_INT32},
	],
})

/*
 ____                            _   _
|  _ \ _ __ ___  _ __   ___ _ __| |_(_) ___  ___
| |_) | '__/ _ \| '_ \ / _ \ '__| __| |/ _ \/ __|
|  __/| | | (_) | |_) |  __/ |  | |_| |  __/\__ \
|_|   |_|  \___/| .__/ \___|_|   \__|_|\___||___/
                |_|
*/

DBusProperty (Server, 'NbCalls', {
	read: t.DBUS_INT16
})

DBusProperty (Server, 'Name', {
	readwrite: t.DBUS_STRING
})

/*
 ____  _                   _
/ ___|(_) __ _ _ __   __ _| |___
\___ \| |/ _` | '_ \ / _` | / __|
 ___) | | (_| | | | | (_| | \__ \
|____/|_|\__, |_| |_|\__,_|_|___/
         |___/
*/

DBusSignal (Server, 'FiveCalls', {
	output: [
		{total_nb: t.DBUS_INT16},
	],
})

module.exports = Server

// DBus service class generated with DBusGenesis!
