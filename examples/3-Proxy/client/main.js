'use strict';

const dbus    = require ('dbus-native')
const inspect = require ('util').inspect
const Promise = require ('bluebird')

const BUS_READY_TIMEOUT = 5 // in s

const bus = dbus.sessionBus()
if (!bus) {
	throw new Error ('Could not connect to the DBus session bus.')
}

bus.on('ready', _ => proceed())

let readyTimeout = setTimeout( _ => {
	throw new Error('Bus was not ready after ' + BUS_READY_TIMEOUT + ' seconds. Timeout.')
}, BUS_READY_TIMEOUT * 1000)

function proceed() {
	const remoteServiceName = 'com.example.Proxy.Server'
	clearTimeout(readyTimeout)

	console.log(`Begin, waiting for proxy to service '${remoteServiceName}' to connect...`)

	// This is how we make a proxy to a remote DBus service
	const proxy = bus.mkProxy(remoteServiceName)

	/*
		The call to `mkProxy()` returns immediately.
		You need to wait for the 'connected' event that tells you the remote DBus service joined the bus (because at
		the time you create the proxy, you do not know if the remote DBus service is connected or not)
	*/
	proxy.on('connected', _ => {
		/*
			The API was designed so that it is as transparent as possible, namely it ressembles traditional Javascript.
			When you have a DBusProxy object (returned by `mkProxy()`), you can traverse it the in the same way the
			service's architecture is organized.
			All DBusProxy have a root object accessible at '/'. Then it's dependent of the organization of the service.
			Here, the root object has a child object named 'com', which has a child named 'example', etc.
		*/
		const obj = proxy['/'].com.example.Proxy.Server

		/*
			Once you have reached the target DBusObject, it can have several DBusInterfaces, so you need to select the
			interface you want. You select by interfaces names.
		*/
		const iface = obj['com.example.Proxy.Server']

		startSequence(iface)
	})

}

// The 'proxy' object here is a DBusInterface
function startSequence (proxy) {
	// All DBusProxy calls are promisified, so use promises everywhere
	return Promise.try( _ => {
		console.log(`Proxy connected!`)

		/*
			First, listen for DBus signal 'FiveCalls'
			DBus signals are translated in Javascript events, so it's very transparent: simply listen for an event
			the same way you do in Javascript.
		*/
		proxy.on('FiveCalls', howMany => {
			console.log(`Signal 'FiveCalls' fired! The total number of calls is: ${howMany}`)
		})

		// To make a call to the function `GiveDate`, simply make this call, it returns a promise...
		return proxy.GiveDate(false)
	})
	.then( date => {
		//... that you can chain with .then()
		console.log(`Got date in non-pretty format: '${date}'`)

		// Another call, with a different argument value
		return proxy.GiveDate(true)
	})
	.then( date => {
		// And a new return value
		console.log(`Got date in pretty format: '${date}'`)

		/*
			Properties access are also promisified. So if you want to GET the value of a property, simply call a
			function that has the property name, WITH NO ARGUMENTS.
		*/
		return proxy.NbCalls()
	})
	.then( nbCalls => {
		// The promise resolves with the propertie's value
		console.log(`Current number of calls is: ${nbCalls}`)

		// Some more method calls ...
		return proxy.Add(42, 1089)
	})
	.then( sum => {
		console.log(`42 + 1089 = ${sum}`)

		return proxy.Add(-10, 100)
	})
	.then( sum => {
		console.log(`-10 + 100 = ${sum}`)

		// Here you access the `Name` property (so it's a GET)
		return proxy.Name()
	})
	.then( name => {
		const newName = 'New name'
		console.log(`The current name is: '${name}', trying to change it to '${newName}'...`)

		/*
			Here, you change the value of the property, so it's a SET.
			A SET is just calling the same function, with ONE PARAMETER: the value you want to set.

			Setters and getters are very similar to standard Javascript getters, only they are promisified.
		*/
		return proxy.Name(newName) // that's how we SET the new value for the property 'Name'
	})
	.then( _ => {
		console.log('Name is supposedly changed, re-asking it now...')
		return proxy.Name()
	})
	.then( newName => {
		console.log(`New name is now: '${newName}'`)
	})
	.delay(2300)
	.then( _ => {
		return proxy.GiveDate(true)
	})
	.then( date => {
		console.log(`Asked date once again and got: '${date}'`)
	})
	.then( _ => {
		console.log('Exiting...bye!')
	})
}

// DBus service class generated with DBusGenesis!
