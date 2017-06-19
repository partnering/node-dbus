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

/** @module TypesOverview */

/**
 * @class
 * Description of class TypesOverview's purpose
 */
class TypesOverview extends DBusInterface {
	constructor (...args) {
		super (...args)

		// Don't forget to set actual property values!


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
	 * Returns a single string.<br>
	 * Strings are simply Javascript string (nobrainer)
	 */
	GiveString () {
		return `Hello, world! This is just a string.`
	}

	/**
	 * Returns a single UInt16 (so positive only).<br>
	 * Numbers in DBus have range, so make sure to pick the correct one
	 */
	GiveUInt16 () {
		return 54827
	}

	/**
	 * Returns a single Int16 (so positive & negative).<br>
	 * Numbers in DBus have range, so make sure to pick the correct one
	 */
	GiveInt16 () {
		return -29786
	}

	/**
	 * Returns a single UInt32 (so positive only).<br>
	 * Numbers in DBus have range, so make sure to pick the correct one
	 */
	GiveUInt32 () {
		return 3728666323
	}

	/**
	 * Returns a single Int16 (so positive & negative).<br>
	 * Numbers in DBus have range, so make sure to pick the correct one
	 */
	GiveInt32 () {
		return -1829732118
	}

	/**
	 * <strong>IMPORTANT: </strong> 64-bit numbers are not natively supported by Javascript. Numbers are 53-bit maximum.
	 * It is planned to use something as BigInt (or such a libary) to send 64-bits numbers.
	 * For the moments, numbers are just <strong>capped</strong> to 53-bits values!
	 */
	GiveUInt64 () {
		return 282126661034182
	}

	/**
	 * <strong>IMPORTANT: </strong> 64-bit numbers are not natively supported by Javascript. Numbers are 53-bit maximum.
	 * It is planned to use something as BigInt (or such a libary) to send 64-bits numbers.
	 * For the moments, numbers are just <strong>capped</strong> to 53-bits values!
	 */
	GiveInt64 () {
		return -4396352187578
	}

	/**
	 * Returns a single double
	 */
	GiveDouble () {
		return 129387.9786742
	}

	/**
	 * Returns a single boolean
	 */
	GiveBoolean () {
		return false
	}

	/**
	 * Returns a single object path.<br>
	 * They are implemented as string in Javascript (but make sure they are valid object-path, so they must start with
	 * a path separator '/', not container special characters, etc. Read the DBus documetnation for the exact rules)
	 */
	GiveObjPath () {
		return '/path/to/some/dbus/object'
	}

	/**
	 * Container type: array.<br>
	 * In DBus, an array is of a fixed type, so it's an "array os strings" or "an array of uint16" for instance. It's
	 * different that in Javascript. <br>
	 * They are implemented as traditional Javascript arrays, but make sure to have only the same types inside your
	 * array, or the marshalling will fail!. Here we declared (see end of file) an array of strings.
	 *
	 * An array is meant to return several values (of same type), whose number can vary or is not known before execution
	 */
	GiveArray () {
		return ['foo', 'bar', 'quux', 'hello, world!']
	}

	/**
	 * Container type: structure.<br>
	 * A structure is a N-tuple of values with fixed-types. That is, it's a way to return N-values (N being fixed and
 	 * known before execution). All types are also fixed and known before execution (for each of the N values).
	 *
	 * A struct is meant to return "structured" data (hence the name), so for instance, if you query a phonebook, you
	 * will always return a tuple of: (the person's name (string), the person's address (string), the person's age
	 * (int16), the person's sex (boolean, for instance)).
	 * This is meant for be very close to a C structure (if you know C ; but then again, who doesn't? ^^)
	 *
	 * It is implemented in Javascript as an array (as arrays in Javascript have the nice property of being able to hold
	 * values of several types at the same time). But you must make sure there are the correct number of types in the
	 * array and theyt they types are correct at each position, otherwise the marshalling will fail.
	 *
	 * Here we declared a structure of 3 elements: a boolean, a double and a string.
	 */
	GiveStruct () {
		return [true, 42.1089, 'Just a string...']
	}

	/**
	 * Container type: dict.<br>
	 * A dict is a key:value object which can contain several elements (the number of which can vary and is not knowne before execution).
	 * The types of the key and the types of the values can be decided, but must remain fixed (i.e. all keys must have
	 * the same type, and all the values must have the same type ; and these two types must be known before execution).\
	 * The type for the keys must be a non-container type (so any DBus type but ARRAY, STRUCT and DICT)
	 *
	 * Here, we declared a dict whose keys are strings and whose values are boolean.
	 *
	 * Dict are implement as Javascript objects. You must make sure the keys are of the same type and the values are all
	 * of the same type or the marshalling will fail.
	 */
	GiveDict () {
		return {
			one: false,
			two: true,
			three: true,
			four: false,
			five: true,
			six: false,
			seven: true,
			eight: false
		}
	}

	/**
	 * Container type: variant.<br>
	 * A variant is a special DBus type, it is a placeholder that you use when you want to return a value but you don't
	 * know the type before execution, which means it can vary.
	 * This is very handful (but care must be taken not to abuse this), but in order for this to work, you must also
	 * return the value's type, so this is costly.
	 *
	 * Variants are implement in Javascript as an object with exaclty 2 keys: `type` and `value`.<br>
	 * The `type` must contain a valid DBus type (you can use the helper for this) and the value must container the
	 * value that you want to return.
	 *
	 * Note that this VARIANT type can be combined with previous container types to return even more complex types (for
	 * instance, an ARRAY of VARIANT, can return several values whose actual type can differ)
	 * Here, we return return either a string or a uint16 based on some random number
	 */
	GiveVariant () {
		const proba = Math.random()

		if (proba > 0.5) {
			// Return a string
			return {
				type: t.DBUS_STRING,
				value: "String from variant"
			}
		} else {
			// Return a number as uint16
			return {
				type: t.DBUS_UINT16,
				value: 42
			}
		}
	}

	/*
		This example shows that we can, in DBus, return <strong>several values</strong.<br>
		This is different than returning an array of several values. Here it is really returning several values, as
		unfamiliar as it may sound in traditional programming languages.

		The number of arguments returned must be known before execution (and the function must always return that many
		arguments), as are their type.

		So in essence, returning several types is <strong>very</strong> similar to return a STRUCT.

		This is implemented in Javascript exactly like a STRUCT: an array of N values with each their fixed type.
	*/
	GiveSeveralValues () {
		return ['String as argument #1', false, -52395872]
	}
}

/*
 __  __      _   _               _
|  \/  | ___| |_| |__   ___   __| |___
| |\/| |/ _ \ __| '_ \ / _ \ / _` / __|
| |  | |  __/ |_| | | | (_) | (_| \__ \
|_|  |_|\___|\__|_| |_|\___/ \__,_|___/
*/

DBusMethod (TypesOverview, 'GiveString', {
	input: [
		{str: t.DBUS_STRING},
	],
	output: [
		{str: t.DBUS_STRING},
	],
})

DBusMethod (TypesOverview, 'GiveUInt16', {
	input: [
	],
	output: [
		{number: t.DBUS_UINT16},
	],
})

DBusMethod (TypesOverview, 'GiveInt16', {
	input: [
	],
	output: [
		{number: t.DBUS_INT16},
	],
})

DBusMethod (TypesOverview, 'GiveUInt32', {
	input: [
	],
	output: [
		{number: t.DBUS_UINT32},
	],
})

DBusMethod (TypesOverview, 'GiveInt32', {
	input: [
	],
	output: [
		{number: t.DBUS_INT32},
	],
})

DBusMethod (TypesOverview, 'GiveUInt64', {
	input: [
	],
	output: [
		{number: t.DBUS_UINT64},
	],
})

DBusMethod (TypesOverview, 'GiveInt64', {
	input: [
	],
	output: [
		{big_number: t.DBUS_INT64},
	],
})

DBusMethod (TypesOverview, 'GiveDouble', {
	input: [
	],
	output: [
		{floating: t.DBUS_DOUBLE},
	],
})

DBusMethod (TypesOverview, 'GiveBoolean', {
	input: [
	],
	output: [
		{bool: t.DBUS_BOOL},
	],
})

DBusMethod (TypesOverview, 'GiveObjPath', {
	input: [
	],
	output: [
		{path: t.DBUS_OBJ_PATH},
	],
})

DBusMethod (TypesOverview, 'GiveArray', {
	input: [
	],
	output: [
		{arr_str: t.DBUS_ARRAY (t.DBUS_STRING)},
	],
})

DBusMethod (TypesOverview, 'GiveStruct', {
	input: [
	],
	output: [
		{my_struct: t.DBUS_STRUCT (t.DBUS_BOOL, t.DBUS_DOUBLE, t.DBUS_STRING)},
	],
})

DBusMethod (TypesOverview, 'GiveDict', {
	input: [
	],
	output: [
		{my_dict: t.DBUS_DICT (t.DBUS_STRING, t.DBUS_BOOL)},
	],
})

DBusMethod (TypesOverview, 'GiveVariant', {
	input: [
	],
	output: [
		{my_variant: t.DBUS_VARIANT}
	],
})

DBusMethod (TypesOverview, 'GiveSeveralValues', {
	input: [
	],
	output: [
		{str: t.DBUS_STRING},
		{bool: t.DBUS_BOOL},
		{int: t.DBUS_INT32}
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

module.exports = TypesOverview

// DBus service class generated with DBusGenesis!
