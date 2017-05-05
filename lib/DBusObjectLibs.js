'use strict';

const Peer              = require ('./std_ifaces/Peer.js')
const debug             = require ('debug')('dbus-native:DBusObjectLibs')
const utils             = require ('./utils.js')
const Errors            = require ('./Errors.js')
const inspect           = require ('util').inspect
const Promise           = require ('bluebird')
const stdifaces         = require ('./stdifaces.js')
const Properties        = require ('./std_ifaces/Properties.js')
const ObjectManager     = require ('./std_ifaces/ObjectManager.js')
const Introspectable    = require ('./std_ifaces/Introspectable.js')
const xmlbuilder        = require ('xmlbuilder')
const DBusInterfaceLibs = require ('./DBusInterfaceLibs')

const mandatory = utils.mandatory

const InvalidNameError = Errors.InvalidNameError

const DBusInterface = DBusInterfaceLibs.DBusInterface

/** @module DBusObject */

/**
 * Represents a DBus Object.<br>
 * A DBusObject can have other (children) objects, and/or one (of several) interfaces.
 *
 * @param {DBusObject|DBusInterface} [objOrIface] - Optional object or interface to create as child for this object
 *
 * @throws {module:Errors#InvalidNameError}
 */
class DBusObject {
	constructor (objOrIface, relativePath) {
		// If the object is passed a DBusObject and we have a 'relativePath', make it a child
		if (objOrIface !== undefined && objOrIface instanceof DBusObject && relativePath !== undefined) {
			debug(`it's an object!`)
			this.addObject (objOrIface, relativePath)
		}
		// If the object is passed a DBusInterface, add it to this Object
		else if (objOrIface !== undefined && objOrIface instanceof DBusInterface) {
			// Warn the user in case a relative path is given with the interface
			// console.warn ('A relative path was given although an interface was passed, the name is useless and will be discarded')

			this.addInterface (objOrIface)
		}
		// Otherwise fail so that the user doesn't think whatever was passed was actually added
		else if (objOrIface !== undefined) {
			throw new TypeError (`DBusObject can only be created with an child object or an interface (or nothing).`)
		}

		// Add standard interface Properties
		this.addInterface (new Properties ('org.freedesktop.DBus.Properties'))

		// Add standard interface Peer
		this.addInterface (new Peer ('org.freedesktop.DBus.Peer'))

		// Add standard interface Introspectable
		this.addInterface (new Introspectable ('org.freedesktop.DBus.Introspectable'))
	}

	enableObjectManager () {
		let currIfacesNames = this.getIfaceNames()
		const objManagerIfaceName = 'org.freedesktop.DBus.ObjectManager'

		if (!currIfacesNames.includes(objManagerIfaceName)) {
			this.addInterface(new ObjectManager(objManagerIfaceName))
		}
	}

	/**
	 * Generate introspection data for this object.<br>
	 * What it does is:
	 * <ul>
	 * <li>have all ints interfaces generate its introspection data</li>
	 * <li>list all children nodes (not the complete introspection data)</li>
	 * <li>concatenate and return</li>
	 * </ul>
	 */
	introspect () {
		let keys = Object.keys (this)
		let ifaces = this.getIfaceNames()
		let objs = this.getChildrenPaths()
		let xml = xmlbuilder.create ('node', {headless: true}) // Create root element without the <?xml version="1.0"?>
			.dtd ('-//freedesktop//DTD D-BUS Object Introspection 1.0//EN',
				'http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd')
			.root() // don't forget to return to the root elem so that elems are not added to the DTD

		// Have each interface generate its introspection data and add it to the root XML element
		for (let iface of ifaces) {
			this[iface].introspect (xml)
		}

		// List each object as nodes
		for (let obj of objs) {
			xml.ele ('node', {name: obj})
		}

		// console.log (xml.end ({pretty: true}))

		// Return the XML string
		return xml.end ({pretty: true})
	}

	/**
	 * Add an interface (and thus a set of functions, methods and signals) to an Object
	 * @param {DBusInterface} iface  The interface to add to the object
	 * @throws {TypeError}
	 */
	addInterface (iface = mandatory()) {
		// Check that 'iface' is a DBusInterface
		if (! (iface instanceof DBusInterface)) {
			throw new TypeError (`'iface' is not a DBusInterface.`)
		}

		// Check if the iface we're trying to add has a valid name
		if (!utils.isValidIfaceName (iface._ifaceName)) {
			throw new TypeError (`'${iface._ifaceName}' is not a valid interface name.`)
		}

		// Everything looks good, proceed to add the interface to the object (erasing the previously one if present)
		this[iface._ifaceName] = iface

		// Give the interface a reference to the object it is associated to
		iface.__dbusObject = this

		if (this.getService()) {
			this.getService().bus.exposeInterface(this.getService(), this, iface._ifaceName, this.getPath())
		}
		// TODO: Implement & emit 'Interface added' from Object Manager
	}

	/**
	 * Remove an interface from this object.
	 * @param {string} ifaceName a valid DBus Interface name string
	 * @param {boolean} shouldEmit directs whether the 'InterfacesRemoved' signal hsould be emitted
	 * @throws {TypeError}
	 */
	removeInterface (ifaceName = mandatory(), shouldEmit = false) {
		return Promise.try( _ => {
			// Check if the supplied interface is part of our interfaces
			if (!this.getIfaceNames().includes(ifaceName)) {
				throw new Error(`Interface '${ifaceName}' is not one of our interfaces: cannot remove it!`)
			}

			// Destroy the interface
			this[ifaceName].destroy()
			delete this[ifaceName]
		})
		.then( _ => {
			if (shouldEmit) {
				const currPath = ['', this.getPath()].join('/')

				this.emitInterfacesRemoved(currPath, [ifaceName])
			}
		})

		// TODO: emit 'InterfacesRemoved' from ObjectManager (should take a boolean as second value to emit or NOT the signal. use true for asingle removal, use false for a batch removal -> it's the caller's responsibility to store the removed names and THEN emit the signal)
	}

	/**
	 * Take a list of interfaces to remove and try to emit the 'InterfacesRemoved' signal with the batch of removed
	 * interfaces.<br>
	 * When removing several interfaces, it is preferred to use this function instead of repeadtly use
	 * 'removeInterface()'.
	 */
	removeInterfaces (ifaceNames = mandatory()) {
		let removedIfaces = []

		if (!Array.isArray(ifaceNames)) {
			throw new TypeError(`removeInterfaces() needs an array as input`)
		}

		// Remove the interfaces, storing the name if it succeeds
		for (let ifaceName of ifaceNames) {
			try {
				this.removeInterfaces(ifaceName, false)
				removedIfaces.push(ifaceName)
			} catch (err) {
				// Don't do anything, we just won't add the interfaces to the array
			}
		}


		// If we managed to removed at least one interface, emit the signal (but DO NOT emit the signal if the array is empty, that would mean the DBusObject got destroyed entirely)
		if (removedIfaces.length !== 0) {
			const currPath = ['', this.getPath()].join('/')

			this.emitInterfacesRemoved(currPath, removedIfaces)
		}
	}

	/**
	 * Remove all interfaces from this object.<br>
	 * It calls 'removeInterface' on all interfaces, store the names in an array and when it's done, emit the signal
	 * with all the values inside the array
	 */
	removeAllInterfaces () {
		// let removedInterfacesNames = []

		return Promise.map(this.getIfaceNames(), ifaceName => {
			return this.removeInterface(ifaceName, false)
			// .then( _ => {
			// 	removedInterfacesNames.push(ifaceName)
			// })
		})
		// .then( _ => {
			// debug(`Should emit signal with array: ${inspect(removedInterfacesNames)} now!`)
			// debug(`Path to emit: ${this.getPath()}`)
			// debug(`TEST: ${this.getIfaceNames()}`)
		// })
	}

	/**
	 * Used to add a child object to either a {@link DBusService} or a {@link DBusObject}.
	 * @param {DBusObject}         object The child object to add
	 * @param {string}             relativePath The relative path at which add the child object
	 *
	 * @todo if the current DBusObject doesn't have interface 'ObjectManager', we should traverse back up the hierarchy and see if any of the parent does have interface 'ObjectManager', and if yes, we should emit the 'InterfacesAdded'.
	 * @throws {TypeError}
	 */
	addObject (object = mandatory(), relativePath = mandatory()) {
		let pathComponents = relativePath.split ('/')
		let objectManagerIface = this['org.freedesktop.DBus.ObjectManager']

		// Check that 'object' is a DBusObject
		if (! (object instanceof DBusObject)) {
			throw new TypeError (`'object' is not a DBusObject.`)
		}

		// Check that all paths components are valid
		if (!pathComponents.every (utils.isValidPathComponent)) {
			throw new TypeError (`'${relativePath}' contains non-valid path components.`)
		}

		/*
		 * Everything looks good, traverse the object according to the path components, and add the obj as child
		 */
		let currObj = this
		// traverse the object

		while (pathComponents.length > 1) {
			let currPathComponent = pathComponents.shift()

			// If the current object doesn't already have an object at this path component, create one
			if (typeof currObj[currPathComponent] === 'undefined') {
				currObj[currPathComponent] = new DBusObject()
				currObj[currPathComponent]._linkParentObject(currObj, currPathComponent)
			}

			// traverse the object
			currObj = currObj[currPathComponent]
		}

		// Now we have traversed our object and reached the object path to host the child, so add it
		if (currObj[pathComponents[0]]) {
			throw new Error(`path ${relativePath} already exists`)
		}
		currObj[pathComponents[0]] = object

		currObj[pathComponents[0]]._linkParentObject(currObj, pathComponents[0])

		if (this.getService()) {
			debug(this.getPath())
			this.getService().bus.exposeObject(this.getService(), object, `${this.getPath()}/${relativePath}`)
		}

		// Check if the object has the interface ObjectManager
		if (objectManagerIface !== undefined) {
			// Compute the new object's path
			let objPath = this.getPath() + '/' + relativePath
			let ifacesAndProperties = {}

			// for (let iface of this.getIfaces()) { // 'this' is not the newly-added object!
			for (let iface of object.getIfaces()) {
				// For each interface of the newly-added object, get all props and values
				let ifaceName = iface._ifaceName
				// debug(`FOR '${ifaceName}'`)

				ifacesAndProperties[ifaceName] = {}

				for (let [propertyName, propAccess] of iface._ifaceDesc.properties) {
					let accessMode = Object.keys(propAccess)[0]

					// DBus spec says 'GetAll' should silently omit properties which can't be accessed
					if (accessMode !== 'write') {
						// Get the property type (used because we return a variant, so we need to type)
						let propType = propAccess[accessMode]
						// debug(`prop '${propertyName}' has access: '${accessMode}' and type '${propType}'`)

						// Build the variant objet for the property
						let variant = {
							type: propType,
							value: iface[propertyName]
						}

						// debug(`variant: ${inspect(variant)}`)
						// Add the variant entry in the return dict
						ifacesAndProperties[ifaceName][propertyName] = variant
						// debug(`ifacesAndProperties is now: ${inspect(ifacesAndProperties)}`)
					}
				}
			}

			debug(`About to emit InterfacesAdded with:\n${inspect(ifacesAndProperties)}`)
			// Emit signal 'InterfacesAdded'
			objectManagerIface.emit('InterfacesAdded', objPath, ifacesAndProperties)
		} else {
			debug(`No ObjectManager interface`)
		}
	}

	/**
	 * Remove the given Object Path subtree
	 * @param {string} objPathComponent valid <strong>relative</strong> DBus Object Path
	 * @throws {TypeError} if objPathComponent is not a valid dbus object path string
	 */
	removeObject (objPathComponent = mandatory()) {
		// First make sure an absolute path was not provided
		if (objPathComponent.startsWith('/')) {
			throw new Error(`You must provide a relative path to 'removeObject()'`)
		}

		// Second, check if the supplied path component is a subtree of not
		if (objPathComponent.includes('/')) {
			// If this is a subtree, then just call `removeObject` to the concerned child
			let pathComponents = objPathComponent.split('/')
			let child = pathComponents.shift() // take the first child and remove it from the array

			// Make sure that we have a child named like this
			if (!this.getChildrenPaths().includes(child)) {
				throw new Error(`No child '${child}': cannot propagate call to removeObject()`)
			}

			// Forward the call to the child, passing the rest of the object path (remember: shift() changes the array)
			return this[child].removeObject(pathComponents.join('/'))
		}
		// no '/' means the subtree is in our children
		else {
			// So make sure we do have a child that corresponds
			if (!this.getChildrenPaths().includes(objPathComponent)) {
				throw new Error(`No child '${objPathComponent}': cannot remove object!`)
			}

			return this[objPathComponent]._removeObjectHierarchy()
			.then( _ => {
				let removedObjPath = ['', this.getPath(), objPathComponent].join('/')

				debug(`DBusObject '${objPathComponent}' removed, emitting now...`)

				/*
					The DBus documentation is unclear.
					When we want to emit the signal because an entire Object Path is removed, it is unspecified whether we should include **all** of the Object's interfaces or none of them (empty array meaninig "all").

					I have asked the question on the DBus mailing list, but in the meantime, I chose the convention to send an empty array.
				*/
				this.emitInterfacesRemoved(removedObjPath, [])
			})
			.then( _ => {
				delete this[objPathComponent]
			})
		}
	}

	// _removeObjectHierarchy(dbusObject = mandatory()) {
	_removeObjectHierarchy() {
		let childrenPath = this.getChildrenPaths()

		return Promise.map( childrenPath, childPath => {
			return this[childPath]._removeObjectHierarchy()
			.then( _ => {
				return this[childPath].__removeObjectProperties()
			})
		})
		.then( _ => {
			return this.__removeObjectProperties()
		})
	}

	__removeObjectProperties() {
		return this.removeAllInterfaces()
		.then( _ => {
			this._unlinkParentObject()
		})
	}

	/**
	 * Check if this DBusObject implements interface 'ObjectManager'. If yes, emit the 'InterfacesRemoved' signal with
	 * the supplied arguments.<br>
	 * If no, forward this call to the parent object and recurse until a DBusObject that implements this interface is
	 * found, or the top-level is reached.
	 */
	emitInterfacesRemoved (objPath = mandatory(), interfaces = mandatory()) {
		const targetIfaceName = 'org.freedesktop.DBus.ObjectManager'
		const targetSignalName = 'InterfacesRemoved'

		// Check if this DBusObject implements the interface
		if (!this.getIfaceNames().includes(targetIfaceName)) {
			// Forward the call to the parent object, if we have one
			if (this._parentObject !== undefined) {
				return this._parentObject.emitInterfacesRemoved(objPath, interfaces)
			} else {
				debug(`Reached top-level and could not emit 'InterfacesRemoved'`)
			}
		}
		// If we do, then emit the signal
		else {
			this[targetIfaceName].emit(targetSignalName, objPath, interfaces)
		}
	}

	/**
	 * Get all direct sub path components of this object's path
	 */
	getChildrenPaths () {
		return Object.keys(this).filter(key => this[key] instanceof DBusObject && key !== '_parentObject')
	}

	/**
	 * Get all direct sub objects of this object
	 */
	getChildren () {
		return this.getChildrenPaths().map(key => this[key])
	}

	/**
	 * Get all iface names associated with this object
	 */
	getIfaceNames () {
		return Object.keys(this).filter(key => this[key] instanceof DBusInterface)
	}

	/**
	 * Get all ifaces associated with this object
	 */
	getIfaces () {
		return this.getIfaceNames().map(key => this[key])
	}

	/**
	 * Get parent object of this object if it exists
	 */
	getParentObject () {
		return this._parentObject
	}

	/**
	 * get the path component to which this object is located in the parent object if it exists
	 */
	getPathComponent () {
		return this._pathComponent
	}

	/**
	 * Get the service that exposes this object if it exists
	 */
	getService () {
		return this._service
	}

	/**
	 * set the service that exposes this object path
	 * @param {DBusService} service
	 */
	setService (service) {
		this._service = service
	}

	/**
	 * Returns the full path to access this object (or the least relative path if the object is not exposed yet)
	 */
	getPath () {
		let path = []
		let currObj = this
		let component

		while (currObj && (component = currObj.getPathComponent())) {
			path.unshift(component)
			currObj = currObj.getParentObject()
		}

		path = path.join('/')
		if (this.getService()) {
			path = '/'+path
		}

		return path
	}

	_unlinkParentObject () {
		delete this._parentObject
	}

	_linkParentObject (parent, pathComponent) {
		this._parentObject = parent
		this._pathComponent = pathComponent
	}
}

module.exports = {
	DBusObject,
}
