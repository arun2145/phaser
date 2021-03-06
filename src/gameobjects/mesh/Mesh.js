/**
 * @author       Richard Davey <rich@photonstorm.com>
 * @copyright    2020 Photon Storm Ltd.
 * @license      {@link https://opensource.org/licenses/MIT|MIT License}
 */

var AnimationState = require('../../animations/AnimationState');
var Class = require('../../utils/Class');
var Components = require('../components');
var Face = require('./Face');
var GameObject = require('../GameObject');
var GameObjectEvents = require('../events');
var GetCalcMatrix = require('../GetCalcMatrix');
var MeshRender = require('./MeshRender');
var Vertex = require('./Vertex');

/**
 * @classdesc
 * A Mesh Game Object.
 *
 * The Mesh object is WebGL only and does not have a Canvas counterpart.
 *
 * The Mesh origin is always 0.5 x 0.5 and cannot be changed.
 *
 * @class Mesh
 * @extends Phaser.GameObjects.GameObject
 * @memberof Phaser.GameObjects
 * @constructor
 * @webglOnly
 * @since 3.0.0
 *
 * @extends Phaser.GameObjects.Components.AlphaSingle
 * @extends Phaser.GameObjects.Components.BlendMode
 * @extends Phaser.GameObjects.Components.Depth
 * @extends Phaser.GameObjects.Components.Mask
 * @extends Phaser.GameObjects.Components.Pipeline
 * @extends Phaser.GameObjects.Components.Size
 * @extends Phaser.GameObjects.Components.Texture
 * @extends Phaser.GameObjects.Components.Transform
 * @extends Phaser.GameObjects.Components.Visible
 * @extends Phaser.GameObjects.Components.ScrollFactor
 *
 * @param {Phaser.Scene} scene - The Scene to which this Game Object belongs. A Game Object can only belong to one Scene at a time.
 * @param {number} x - The horizontal position of this Game Object in the world.
 * @param {number} y - The vertical position of this Game Object in the world.
 * @param {number[]} vertices - An array containing the vertices data for this Mesh.
 * @param {number[]} uvs - An array containing the uv data for this Mesh.
 * @param {number[]} [indicies] - An array containing the vertex indicies for this Mesh.
 * @param {number|number[]} [colors] - An array containing the color data for this Mesh.
 * @param {number|number[]} [alphas] - An array containing the alpha data for this Mesh.
 * @param {string|Phaser.Textures.Texture} [texture] - The key, or instance of the Texture this Game Object will use to render with, as stored in the Texture Manager.
 * @param {string|integer} [frame] - An optional frame from the Texture this Game Object is rendering with.
 */
var Mesh = new Class({

    Extends: GameObject,

    Mixins: [
        Components.AlphaSingle,
        Components.BlendMode,
        Components.Depth,
        Components.Mask,
        Components.Pipeline,
        Components.Size,
        Components.Texture,
        Components.Transform,
        Components.Visible,
        Components.ScrollFactor,
        MeshRender
    ],

    initialize:

    function Mesh (scene, x, y, vertices, uvs, indicies, colors, alphas, texture, frame)
    {
        GameObject.call(this, scene, 'Mesh');

        /**
         * The Animation State of this Mesh.
         *
         * @name Phaser.GameObjects.Mesh#anims
         * @type {Phaser.Animation.AnimationState}
         * @since 3.50.0
         */
        this.anims = new AnimationState(this);

        /**
         * An array containing the Face instances belonging to this Mesh.
         *
         * A Face consists of 3 Vertex objects.
         *
         * This array is populated during the `setVertices` method.
         *
         * @name Phaser.GameObjects.Mesh#faces
         * @type {Phaser.GameObjects.Face[]}
         * @since 3.50.0
         */
        this.faces = [];

        /**
         * An array containing Vertex instances. One instance per vertex in this Mesh.
         *
         * This array is populated during the `setVertices` method.
         *
         * @name Phaser.GameObjects.Mesh#vertices
         * @type {Phaser.GameObjects.Vertex[]}
         * @since 3.50.0
         */
        this.vertices = [];

        /**
         * The tint fill mode.
         *
         * `false` = An additive tint (the default), where vertices colors are blended with the texture.
         * `true` = A fill tint, where the vertices colors replace the texture, but respects texture alpha.
         *
         * @name Phaser.GameObjects.Mesh#tintFill
         * @type {boolean}
         * @default false
         * @since 3.50.0
         */
        this.tintFill = false;

        /**
         * You can optionally choose to render the vertices of this Mesh to a Graphics instance.
         *
         * Achieve this by setting the `debugCallback` and the `debugGraphic` properties.
         *
         * You can do this in a single call via the `Mesh.setDebug` method, which will use the
         * built-in debug function. You can also set it to your own callback. The callback
         * will be invoked _once per render_ and sent the following parameters:
         *
         * `debugCallback(src, meshLength, verts)`
         *
         * `src` is the Mesh instance being debugged.
         * `meshLength` is the number of mesh vertices in total.
         * `verts` is an array of the translated vertex coordinates.
         *
         * To disable rendering, set this property back to `null`.
         *
         * @name Phaser.GameObjects.Mesh#debugCallback
         * @type {function}
         * @since 3.50.0
         */
        this.debugCallback = null;

        /**
         * The Graphics instance that the debug vertices will be drawn to, if `setDebug` has
         * been called.
         *
         * @name Phaser.GameObjects.Mesh#debugGraphic
         * @type {Phaser.GameObjects.Graphics}
         * @since 3.50.0
         */
        this.debugGraphic = null;

        this.setTexture(texture, frame);
        this.setPosition(x, y);
        this.setSizeToFrame();
        this.initPipeline();

        this.addVertices(vertices, uvs, indicies, colors, alphas);

        this.on(GameObjectEvents.ADDED_TO_SCENE, this.addedToScene, this);
        this.on(GameObjectEvents.REMOVED_FROM_SCENE, this.removedFromScene, this);
    },

    //  Overrides Game Object method
    addedToScene: function ()
    {
        this.scene.sys.updateList.add(this);
    },

    //  Overrides Game Object method
    removedFromScene: function ()
    {
        this.scene.sys.updateList.remove(this);
    },

    clearVertices: function ()
    {
        this.faces.forEach(function (face)
        {
            face.destroy();
        });

        this.faces = [];
        this.vertices = [];

        return this;
    },

    addVertices: function (vertices, uvs, indicies, colors, alphas)
    {
        if (colors === undefined) { colors = 0xffffff; }
        if (alphas === undefined) { alphas = 1; }

        if (vertices.length !== uvs.length)
        {
            throw new Error('Mesh - vertices and uv count not equal');
        }

        var i;
        var vert;
        var verts = this.vertices;
        var faces = this.faces;

        var isColorArray = Array.isArray(colors);
        var isAlphaArray = Array.isArray(alphas);

        if (Array.isArray(indicies))
        {
            for (i = 0; i < indicies.length; i++)
            {
                var index = indicies[i] * 2;

                vert = new Vertex(
                    vertices[index],
                    vertices[index + 1],
                    uvs[index],
                    uvs[index + 1],
                    (isColorArray) ? colors[i] : colors,
                    (isAlphaArray) ? alphas[i] : alphas
                );

                verts.push(vert);
            }
        }
        else
        {
            var colorIndex = 0;

            for (i = 0; i < vertices.length; i += 2)
            {
                vert = new Vertex(
                    vertices[i],
                    vertices[i + 1],
                    uvs[i],
                    uvs[i + 1],
                    (isColorArray) ? colors[colorIndex] : colors,
                    (isAlphaArray) ? alphas[colorIndex] : alphas
                );

                verts.push(vert);

                colorIndex++;
            }
        }

        for (i = 0; i < verts.length; i += 3)
        {
            var vert1 = verts[i];
            var vert2 = verts[i + 1];
            var vert3 = verts[i + 2];

            var face = new Face(vert1, vert2, vert3);

            faces.push(face);
        }

        return this;
    },

    getFaceCount: function ()
    {
        return this.faces.length;
    },

    getVertexCount: function ()
    {
        return this.vertices.length;
    },

    getFace: function (index)
    {
        return this.faces[index];
    },

    getFaceAt: function (x, y, camera)
    {
        if (camera === undefined) { camera = this.scene.sys.cameras.main; }

        var calcMatrix = GetCalcMatrix(this, camera).calc;

        var faces = this.faces;
        var results = [];

        for (var i = 0; i < faces.length; i++)
        {
            var face = faces[i];

            if (face.contains(x, y, calcMatrix))
            {
                results.push(face);
            }
        }

        return results;
    },

    /**
     * This method enables rendering of the Mesh vertices to the given Graphics instance.
     *
     * If you enable this feature, you **must** call `Graphics.clear()` in your Scene `update`,
     * otherwise the Graphics instance you provide to debug will fill-up with draw calls,
     * eventually crashing the browser. This is not done automatically to allow you to debug
     * draw multiple Mesh objects to a single Graphics instance.
     *
     * The Mesh class has a built-in debug rendering callback `Mesh.renderDebugVerts`, however
     * you can also provide your own callback to be used instead. Do this by setting the `callback` parameter.
     *
     * The callback is invoked _once per render_ and sent the following parameters:
     *
     * `callback(src, meshLength, verts)`
     *
     * `src` is the Mesh instance being debugged.
     * `meshLength` is the number of mesh vertices in total.
     * `verts` is an array of the translated vertex coordinates.
     *
     * If using your own callback you do not have to provide a Graphics instance to this method.
     *
     * To disable debug rendering, to either your own callback or the built-in one, call this method
     * with no arguments.
     *
     * @method Phaser.GameObjects.Mesh#setDebug
     * @since 3.50.0
     *
     * @param {Phaser.GameObjects.Graphics} [graphic] - The Graphic instance to render to if using the built-in callback.
     * @param {function} [callback] - The callback to invoke during debug render. Leave as undefined to use the built-in callback.
     *
     * @return {this} This Game Object instance.
     */
    setDebug: function (graphic, callback)
    {
        this.debugGraphic = graphic;

        if (!graphic && !callback)
        {
            this.debugCallback = null;
        }
        else if (!callback)
        {
            this.debugCallback = this.renderDebugVerts;
        }
        else
        {
            this.debugCallback = callback;
        }

        return this;
    },

    /**
     * The Mesh update loop.
     *
     * @method Phaser.GameObjects.Mesh#preUpdate
     * @protected
     * @since 3.50.0
     *
     * @param {number} time - The current timestamp.
     * @param {number} delta - The delta time, in ms, elapsed since the last frame.
     */
    preUpdate: function (time, delta)
    {
        this.anims.update(time, delta);
    },

    /**
     * The built-in Mesh vertices debug rendering method.
     *
     * See `Mesh.setDebug` for more details.
     *
     * @method Phaser.GameObjects.Mesh#renderDebugVerts
     * @since 3.50.0
     *
     * @param {Phaser.GameObjects.Mesh} src - The Mesh object being rendered.
     * @param {integer} meshLength - The number of vertices in the mesh.
     * @param {number[]} verts - An array of translated vertex coordinates.
     */
    renderDebugVerts: function (src, meshLength, verts)
    {
        var graphic = src.debugGraphic;

        for (var i = 0; i < meshLength; i += 6)
        {
            var x0 = verts[i + 0];
            var y0 = verts[i + 1];
            var x1 = verts[i + 2];
            var y1 = verts[i + 3];
            var x2 = verts[i + 4];
            var y2 = verts[i + 5];

            graphic.strokeTriangle(x0, y0, x1, y1, x2, y2);
        }
    },

    /**
     * Handles the pre-destroy step for the Mesh, which removes the Animation component and typed arrays.
     *
     * @method Phaser.GameObjects.Mesh#preDestroy
     * @private
     * @since 3.50.0
     */
    preDestroy: function ()
    {
        this.anims.destroy();

        this.anims = undefined;

        this.clearVertices();

        this.debugCallback = null;
        this.debugGraphic = null;
    }

});

module.exports = Mesh;
