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

/** @module SimpleService */

/**
 * @class
 * The SimpleService example is just here to demonstrate the basic usage of the library.<br>
 * It shows how to create an interface, a main object path and expose them through a service on the (session) bus.
 */
class SimpleService extends DBusInterface {
	constructor (...args) {
		/*
			At a bare minimum (i.d. if you don't need any additional information) you need to pass the interface name
			to the constructor of an interface.
			If you need to pass some other argument that make sense to you only, change this line to
			`constructor (ifaceName, otherArg1, otherArg2)` and the live just below by: `super(ifaceName)`.
			Then do whatever you want with the other arguments
		*/
		super (...args)

		/*
			Here comes the definition of the DBusProperties that your interface has.
			Make sure to always specify a starting value as DBus doesn't allow properties without a value.
			Note that it's still valid Javascript code, so you can obviously define whatever properties you want here,
			they won't be exposed on the bus unless you call `DBusProperty()` on then (see end of file).
			Please keep in mind that the DBus convetnion is for exposed properties to be "CamelCase" (not the first letter also being capital). So in order to avoid confusion, it's best if you define your own, internal attributes with a leading underscore ('_') and don't capitalize the first letter, such as '_internalAttribute'.
		*/

		/**
		 * The ExampleProperty is just an example how to get a number (more specifically an unsigned int 16 integers)
		 * @type {Number}
		 */
		this.ExampleProperty = 1089


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
			console.log('Interface is not exposed on the bus, ready to receive DBus method call!')
		})
	}

	/*
		Here comes the definitions of the DBusMethods that this interface implements.
		Make sure that they return value matches the type you declared in 'DBusMethod()' (see end of file).
		Note that the DBus convention is to have methods named in 'CamelCase()' style (note the leading letter being capitalized) ; this is the same convention for properties.
		Note that you can obviously define your own internla methods here, and they won't be exposed on the bus unless you call 'DBusMethod()' on them (see end of file). Just as with properties, it's best if you name your own internal methods with a leading underscore ('_') and do not capitalize the first letter, as such: `_internalMethod()`
	*/

	/**
	 * Just a function "hello world" function that takes an argument and answer "hello" to the named argument.
	 */
	SayHello (who) {
		if (who === '') {
			return 'Hello, world!'
		} else {
			return `Hello, ${who}!`
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

/*
	This is how we declare methods to be exposed on the bus. If you dont call `DBusMethod()` on a function, it stays an internal function and no other service or people will see it on the bus.

	See the README file for the full explanation about DBusMethod()
*/

DBusMethod (SimpleService, 'SayHello', {
	input: [
		{who: t.DBUS_STRING},
	],
	output: [
		{hello_sentence: t.DBUS_STRING},
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
	This is how we declare properties to be exposed on the bus. If you dont call `DBusProperty()` on an attribute, it stays an internal attribute and no other service or people will see it on the bus.

	See the README file for the full explanation about DBusProperty()
*/

DBusProperty (SimpleService, 'ExampleProperty', {
	readwrite: t.DBUS_UINT16
})

/*
 ____  _                   _
/ ___|(_) __ _ _ __   __ _| |___
\___ \| |/ _` | '_ \ / _` | / __|
 ___) | | (_| | | | | (_| | \__ \
|____/|_|\__, |_| |_|\__,_|_|___/
         |___/
*/

/*
	This is how we declare signals to be exposed on the bus. If you dont call `DBusSignal()` on an event, it stays an internal event and no other service or people will see it on the bus.

	See the README file for the full explanation about DBusSignal()
*/

DBusSignal (SimpleService, 'Random', {
	output: [
		{random_number: t.DBUS_INT16},
	],
})

module.exports = SimpleService

// DBus service class generated with DBusGenesis!
