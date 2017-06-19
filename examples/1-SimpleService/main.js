'use strict';

const dbus    = require ('dbus-native')
const inspect = require ('util').inspect
const Promise = require ('bluebird')
const SimpleService = require ('./SimpleService.js')

const DBusService    = dbus.DBusService
const DBusObjectLibs = dbus.DBusObjectLibs

const DBusObject = DBusObjectLibs.DBusObject

// Time after which we will timeout if the bus is not ready by then
const BUS_READY_TIMEOUT = 5 // in s

// The name we want to expose our DBus service on
const serviceName = 'com.example.SimpleService'

/*
	Use the same name for the interface as for the service, which is pretty standard (although not mandatory) for simple service.
	Feel free to change and set what you want.
*/
const interfaceName = serviceName

/*
	As it's the case for the interface name, it's standard to derive the object path from the service / interface name
	for simple service. We simply replace dots ('.') by path separator ('/').
*/
const objectPath = '/' + serviceName.replace (/\./g, '/')

// It means we will expose our service on the unrestricted session bus. Use `dbus.systemBus()` to go on the system bus
const bus = dbus.sessionBus()
if (!bus) {
	throw new Error ('Could not connect to the DBus session bus.')
}

/*
	The `bus` object will emit `ready` when it completed the handshake with the dbus daemon. This should be relatively
	fast. This is why we set a timeout to kill the application in case it takes too much time (indicating there is
	some communication problems)
*/
bus.on('ready', _ => proceed())

// The timeout function that kills the application if the bus doesn't complete the handshake after too long
let readyTimeout = setTimeout( _ => {
	throw new Error('Bus was not ready after ' + BUS_READY_TIMEOUT + ' seconds. Timeout.')
}, BUS_READY_TIMEOUT * 1000)

function proceed() {
	// In the callback that is executed when the handshake is completed, we make sure to stop the timeout function
	clearTimeout(readyTimeout)

	/*
		Here we create our DBusInterface object, we need to pass at least the interface name we chose
	*/
	let iface = new SimpleService (interfaceName)

	/*
		Create the main object that implements the main interface
		Note that it is also possible to add an interface with `obj.addInterface (iface)`
	*/
	let obj = new DBusObject (iface) // add the interface directly on build

	// Create the service
	let service = new DBusService ()

	// Add the main object as child to the service (note that the path must be relative: no initial '/')
	service.addObject (obj, objectPath.substr(1))

	// Expose the service on the bus so that it's usable by other services and clients
	bus.exposeService (service, serviceName) // the call is promisified
	.then (() => {
		/*
			When we are here, it means the service is exposed on the bus and other services / people can see it and
			start making DBus method calls, listening to signals, querying for properties, etc.
		*/
		console.log ('Service exposed and ready to answer calls, with name \'' + serviceName + '\'')

		setInterval( _ => {
			/*
				We compute a random number an only emit the signal if the random number if greater than a threshold to
				prevent firing every 2.5 seconds. This introduces a randomness
			*/
			const proba = Math.random()
			const threshold = 0.75

			if (proba > 0.75) {
				// Generate a random number between -100 and +100
				const number = Math.round(200 * Math.random()) - 100

				// Emit the Javascript event, which will be emited as a DBus signal
				iface.emit('Random', number)
			}
		}, 2500)
	})
	.catch( (err) => {
		console.error ('Failed to exposed service on bus: ' + err)
	})
}

// DBus service class generated with DBusGenesis!
