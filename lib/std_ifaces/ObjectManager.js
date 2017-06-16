'use strict';

const debug             = require ('debug')('dbus-native:ObjectManager')
const utils             = require ('../utils.js')
const inspect           = require ('util').inspect
const Promise           = require ('bluebird')
const signature         = require ('../signature.js')
const DBusInterfaceLibs = require ('../DBusInterfaceLibs.js')

const DBUS_BYTE = signature.DBUS_BYTE
const DBUS_BOOL = signature.DBUS_BOOL
// For convenience, because I keep wondering whether it's 'BOOL' or 'BOOLEAN'!
const DBUS_BOOLEAN = signature.DBUS_BOOLEAN
const DBUS_INT16 = signature.DBUS_INT16
const DBUS_UINT16 = signature.DBUS_UINT16
const DBUS_INT32 = signature.DBUS_INT32
const DBUS_UINT32 = signature.DBUS_UINT32
const DBUS_INT64 = signature.DBUS_INT64
const DBUS_UINT64 = signature.DBUS_UINT64
const DBUS_DOUBLE = signature.DBUS_DOUBLE
const DBUS_UNIX_FD = signature.DBUS_UNIX_FD
const DBUS_STRING = signature.DBUS_STRING
const DBUS_OBJ_PATH = signature.DBUS_OBJ_PATH
const DBUS_SIGNATURE = signature.DBUS_SIGNATURE
const DBUS_ARRAY = signature.DBUS_ARRAY
const DBUS_DICT = signature.DBUS_DICT
const DBUS_STRUCT = signature.DBUS_STRUCT
const DBUS_VARIANT = signature.DBUS_VARIANT

const DBusMethod    = DBusInterfaceLibs.DBusMethod
const DBusSignal    = DBusInterfaceLibs.DBusSignal
const DBusProperty  = DBusInterfaceLibs.DBusProperty
const DBusInterface = DBusInterfaceLibs.DBusInterface

/** @module ObjectManager.js */

/**
 * @class
 * Description of class ObjectManager.js's purpose
 */
class ObjectManager extends DBusInterface {
	constructor (...args) {
		super (...args)

		// Don't forget to set actual property values!


		// We we don't need to access the service or the bus from within this interface
		// this.on ('ExposedOnBus', service => {
		// })
	}

	/**
	 * Return the subtree of this object path
	 */
	GetManagedObjects () {
		debug(`GetManagedObjects()`)
		let acc = {}

		ObjectManager.getManagedObjects(this.__dbusObject, acc)

		return acc
	}

	static getManagedObjects (obj, acc) {
		let currentPath = obj.getPath()
		debug(`Recursion on '${currentPath}'`)

		// First, find all interfaces for this object
		let ifaceNames = Object.keys(obj).filter( k => utils.isValidIfaceName(k) )
		debug(`ifaces: ${inspect(ifaceNames)}`)

		// For all interfaces...
		for (let ifaceName of ifaceNames) {
			// ...find the properties
			let properties = obj[ifaceName]._ifaceDesc.properties // this is a Map

			// If there are properties for this interface, create an entry for this object path and this interface
			if (properties.size !== 0) {
				// Create an entry for this object path if it doesn't exist
				if (acc[currentPath] === undefined)
					acc[currentPath] = {}

				// Create an entry for this interface in this object path
				acc[currentPath][ifaceName] = {}

				// Populate this entry with the properties (that are not writeonly)
				for (let [propName, propAccess] of properties) {
					let accessMode = Object.keys(propAccess)[0]

					if (accessMode !== 'write') {
						let propType = propAccess[accessMode]

						let variant = {
							type: propType,
							value: obj[ifaceName][propName]
						}

						// Put this inside the DICT
						acc[currentPath][ifaceName][propName] = variant
					}
				}
			}
		}

		// Second, find all children of this DBusObject and apply this funtion recursively
		for (let childPath of obj.getChildrenPaths()) {
			ObjectManager.getManagedObjects(obj[childPath], acc)
		}
	}
}

/*
 __  __      _   _               _
|  \/  | ___| |_| |__   ___   __| |___
| |\/| |/ _ \ __| '_ \ / _ \ / _` / __|
| |  | |  __/ |_| | | | (_) | (_| \__ \
|_|  |_|\___|\__|_| |_|\___/ \__,_|___/
*/

DBusMethod (ObjectManager, 'GetManagedObjects', {
	input: [
	],
	output: [
		{objpath_interfaces_and_properties: DBUS_DICT (DBUS_OBJ_PATH, DBUS_DICT (DBUS_STRING, DBUS_DICT (DBUS_STRING, DBUS_VARIANT)))},
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

/*
 ____  _                   _
/ ___|(_) __ _ _ __   __ _| |___
\___ \| |/ _` | '_ \ / _` | / __|
 ___) | | (_| | | | | (_| | \__ \
|____/|_|\__, |_| |_|\__,_|_|___/
         |___/
*/

DBusSignal (ObjectManager, 'InterfacesAdded', {
	output: [
		{object_path: DBUS_OBJ_PATH},
		{interfaces_and_properties: DBUS_DICT (DBUS_STRING, DBUS_DICT (DBUS_STRING, DBUS_VARIANT))},
	],
})

DBusSignal (ObjectManager, 'InterfacesRemoved', {
	output: [
		{object_path: DBUS_OBJ_PATH},
		{interfaces: DBUS_ARRAY (DBUS_STRING)},
	],
})

module.exports = ObjectManager

// DBus service class generated with DBusGenesis!
