'use strict';

const dbus    = require ('../../index.js')
const inspect = require ('util').inspect
const Promise = require ('bluebird')

const Contact = require ('./Contact')

const DBusObject        = dbus.DBusObjectLibs.DBusObject
const DBusInterfaceLibs = dbus.DBusInterfaceLibs

const t = dbus.type

const DBusMethod    = DBusInterfaceLibs.DBusMethod
const DBusSignal    = DBusInterfaceLibs.DBusSignal
const DBusProperty  = DBusInterfaceLibs.DBusProperty
const DBusInterface = DBusInterfaceLibs.DBusInterface

/** @module PhoneBook */

/**
 * @class
 * Description of class PhoneBook's purpose
 */
class PhoneBook extends DBusInterface {
	constructor (...args) {
		super (...args)

		// Don't forget to set actual property values!

		/**
		 * The list of object paths of the contacts
		 * @type {Array<string>}
		 */
		this.Contacts = []


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
	 * Create a new entry in the phone book
	 */
	CreateNewContact (name, surname, phone, age) {
		// Check that we don't already have this user
		return Promise.try( _ => {
			let newEntry = `/com/test/PhoneBook/Contacts/${name}${surname}`

			if (this.Contacts.includes(newEntry)) {
				throw new Error(`Contact '${name} ${surname}' already exists`)
			}

			// Create a new child object (with the Contact interface)
			this.__dbusObject.addObject(new DBusObject(new Contact('com.test.PhoneBook.Contact', name, surname, phone, age)), `Contacts/${name}${surname}`)

			this.Contacts.push(newEntry)

			// And return it
			return newEntry
		})
	}

	/**
	 * Delete an entry in the phone book, identified by the object path
	 */
	DeleteContact (objPath) {
		return this.__dbusObject.getService().removeObject(objPath)
		.then( _ => {
			this.Contacts = this.Contacts.filter( e => e != objPath )
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

DBusMethod (PhoneBook, 'CreateNewContact', {
	input: [
		{name: t.DBUS_STRING},
		{surname: t.DBUS_STRING},
		{phone: t.DBUS_STRING},
		{age: t.DBUS_UINT16},
	],
	output: [
		{obj_path: t.DBUS_OBJ_PATH},
	],
})

DBusMethod (PhoneBook, 'DeleteContact', {
	input: [
		{obj_path: t.DBUS_OBJ_PATH},
	],
	output: [
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

DBusProperty (PhoneBook, 'Contacts', {
	// read: t.DBUS_ARRAY (t.DBUS_OBJ_PATH)
	readwrite: t.DBUS_ARRAY (t.DBUS_OBJ_PATH)
})

/*
 ____  _                   _
/ ___|(_) __ _ _ __   __ _| |___
\___ \| |/ _` | '_ \ / _` | / __|
 ___) | | (_| | | | | (_| | \__ \
|____/|_|\__, |_| |_|\__,_|_|___/
         |___/
*/

module.exports = PhoneBook

// DBus service class generated with DBusGenesis!
