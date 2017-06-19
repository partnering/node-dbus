'use strict';

const Contact = require ('./Contact')
const dbus    = require ('dbus-native')
const inspect = require ('util').inspect
const Promise = require ('bluebird')
const shortid = require ('shortid')

const DBusObjectLibs   = dbus.DBusObjectLibs
const DBusInterfaceLibs = dbus.DBusInterfaceLibs

const t = dbus.type

const DBusMethod    = DBusInterfaceLibs.DBusMethod
const DBusSignal    = DBusInterfaceLibs.DBusSignal
const DBusProperty  = DBusInterfaceLibs.DBusProperty
const DBusInterface = DBusInterfaceLibs.DBusInterface

const DBusObject = DBusObjectLibs.DBusObject


/** @module PhoneBook */

/**
 * @class
 * The PhoneBook class is used to demonstrate object path manipulation (namely, addition and deletion).
 * This implements (very) basic phone-book-like application, which keeps tracks of contacts. You can add and delete a
 * contact.<br>
 * Every contact is a DBus object node, a child of the main object path. They implement a second DBusInterface
 * 'Contact' which is described in its own file.
 */
class PhoneBook extends DBusInterface {
	constructor (...args) {
		super (...args)

		// Don't forget to set actual property values!

		/**
		 * An array containing the mapping between a contact's object path and its name
		 * @type {Array(string, string)}
		 */
		this.Contacts = []

		/**
		 * Keep trakc of the total number of contacts
		 * @type {Number}
		 */
		this.NbContacts = 0


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
	 * Add a new contact in the phonebook.
	 * @param {string} name Name of the contact
	 * @param {string} phoneNumber Phone number of the contact
	 * @param {Number} age The age of the contact
	 */
	AddContact (name, phoneNumber, age) {
		// Don't forget that all methods are promisified
		return Promise.try( _ => {
			// Make some basic checks (which allows you to see how we deal with errors)
			if (name === '')
				throw new Error(`Contact's name cannot be empty!`)

			// Create a new Contact interface
			const contactIface = new Contact('com.example.PhoneBook.Contact', name, age, phoneNumber) // this is the interface's name

			let contactID = shortid.generate()

			// Dirty: remove '-' and '_' character from the ID because they are not valid in object paths
			contactID = contactID.replace(/[-_]/g, '')

			// Create a new DBusObject to hold this interface
			const contactObj = new DBusObject(contactIface. contactID)

			/*
				This is to enable the standard DBus interface 'ObjectManager'.
				This fires events that tell the proxies there are new object path nodes
			*/
			contactObj.enableObjectManager()

			/*
				Actually add the DBusObject as a child ob the main object path.
				From inside a DBusInterface (as we're are now), we can access the DBusObject that implements us with
				the field '__dbusObject'.
				We can add a new child node with `addObject()`, which takes the DBusObject and the RELATIVE paths as
				arguments
			*/
			this.__dbusObject.addObject(contactObj, 'Contacts/' + contactID)

			this.NbContacts += 1

			return contactID
		})
		.then( contactID => {
			/*
				We want to return the object path to the caller. This is comprised of:
				- the parent object's path
				- concatenated with 'Contact/'
				- contatenated with the contact number

				We can get a DBusObject's path with the internal method 'getPath()'
			*/

			const contactPath =  this.__dbusObject.getPath() + '/Contacts/' + contactID

			// Add the contacst in the list of contacts
			this.Contacts.push([contactPath, name])

			return contactPath
		})
	}

	/**
	 * Delete contacts from the phone book. This deletes the DBus Object path nodes<br>
	 * Note that this is implemented as a method that takes an array of contacts to remove, rather than only one
	 * contact.<br>
	 * This is a common good practise in DBus to avoid roundtrip, so in case you have several contacts to remove (think
 	 * about checkboxes selected in an GUI) you make only one method call instead of N. And in case you have just one,
	 * it's just a matter of making a one-element Array<br><br>
	 *
	 * To remove an object path, you have two possibilities:
	 * 1. call `removeObject()` on the DbusService (it will traverse down to the target object)
	 * 2. call `removeObject()` on the parent DBusObject, but you will submit the relative path. so it's your
	 * responsibility to subtract the current prefix.<br><br>
	 *
	 * You can get a handler to the DBusService object by calling `getService()` on any DBusObject
	 *
	 * @param {Array<string>} contacts - The list of contact's object paths to remove
	 *
	 */
	DeleteContacts (contacts) {
		const service = this.__dbusObject.getService()

		for (let contact of contacts) {
			// Check if this is a contact we have
			if (this.Contacts.some( e => e[0] === contact) ) {
				// Remove the DBus object path node
				service.removeObject(contact)

				// Decrement the number of contacts
				this.NbContacts -= 1

				// Remove the object path from the list
				this.Contacts = this.Contacts.filter( e => e[0] !== contact )
			}
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

DBusMethod (PhoneBook, 'AddContact', {
	input: [
		{name: t.DBUS_STRING},
		{phone_number: t.DBUS_STRING},
		{age: t.DBUS_UINT16},
	],
	output: [
		{obj_path: t.DBUS_OBJ_PATH},
	],
})

DBusMethod (PhoneBook, 'DeleteContacts', {
	input: [
		{contacts: t.DBUS_ARRAY (t.DBUS_OBJ_PATH)},
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
	read: t.DBUS_ARRAY (t.DBUS_STRUCT (t.DBUS_OBJ_PATH, t.DBUS_STRING))
})

DBusProperty (PhoneBook, 'NbContacts', {
	read: t.DBUS_UINT16
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
