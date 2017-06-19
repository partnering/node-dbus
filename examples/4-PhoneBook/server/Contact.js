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

/** @module Contact */

/**
 * @class
 * Simple 'Contact' class for the phone-book example.
 */
class Contact extends DBusInterface {
	constructor (ifaceName, name, age, phoneNumber) {
		super (ifaceName)

		// Don't forget to set actual property values!

		/**
		 * Name of the contact
		 * @type {string}
		 */
		this.ContactName = name

		/**
		 * Age of the contact
		 * @type {Number}
		 */
		this.Age = age

		/**
		 * Contact's phone number
		 * @type {string}
		 */
		this.PhoneNumber = phoneNumber

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
	 * Dummy function to emulate a call to a contact (just to have one method...)
	 */
	Call () {
		return `Calling '${this.Name}'...`
	}
}

/*
 __  __      _   _               _
|  \/  | ___| |_| |__   ___   __| |___
| |\/| |/ _ \ __| '_ \ / _ \ / _` / __|
| |  | |  __/ |_| | | | (_) | (_| \__ \
|_|  |_|\___|\__|_| |_|\___/ \__,_|___/
*/

DBusMethod (Contact, 'Call', {
	input: [
	],
	output: [
		{dummy_str: t.DBUS_STRING},
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

DBusProperty (Contact, 'ContactName', {
	readwrite: t.DBUS_STRING
})

DBusProperty (Contact, 'Age', {
	readwrite: t.DBUS_UINT16
})

DBusProperty (Contact, 'PhoneNumber', {
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

module.exports = Contact

// DBus service class generated with DBusGenesis!
