<?php
/**
 * Plugin Name: Split With Screenshot On Dark
 * Description: Forma generated Gutenberg block.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
  exit;
}

add_action('init', function () {
  wp_register_script(
    'wp-splitwithscreenshotondark',
    plugins_url('block.js', __FILE__),
    array('wp-blocks', 'wp-element'),
    filemtime(plugin_dir_path(__FILE__) . 'block.js')
  );

  wp_register_style(
    'wp-splitwithscreenshotondark-style',
    plugins_url('style.css', __FILE__),
    array(),
    file_exists(plugin_dir_path(__FILE__) . 'style.css') ? filemtime(plugin_dir_path(__FILE__) . 'style.css') : null
  );

  register_block_type('wp/splitwithscreenshotondark-splitwithscreenshotondark1style', array(
    'editor_script' => 'wp-splitwithscreenshotondark',
    'style' => 'wp-splitwithscreenshotondark-style',
    'editor_style' => 'wp-splitwithscreenshotondark-style'
  ));

  register_block_type('wp/splitwithscreenshotondark-splitwithscreenshotondark2deploytoth', array(
    'editor_script' => 'wp-splitwithscreenshotondark',
    'style' => 'wp-splitwithscreenshotondark-style',
    'editor_style' => 'wp-splitwithscreenshotondark-style'
  ));
});
