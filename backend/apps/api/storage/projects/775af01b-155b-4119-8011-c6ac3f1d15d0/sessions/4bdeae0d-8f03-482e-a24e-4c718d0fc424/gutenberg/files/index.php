<?php
/**
 * Plugin Name: Index
 * Description: Forma generated Gutenberg block.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
  exit;
}

add_action('init', function () {
  wp_register_script(
    'wp-index',
    plugins_url('block.js', __FILE__),
    array('wp-blocks', 'wp-element'),
    filemtime(plugin_dir_path(__FILE__) . 'block.js')
  );

  wp_register_style(
    'wp-index-style',
    plugins_url('style.css', __FILE__),
    array(),
    file_exists(plugin_dir_path(__FILE__) . 'style.css') ? filemtime(plugin_dir_path(__FILE__) . 'style.css') : null
  );

  register_block_type('wp/index', array(
    'editor_script' => 'wp-index',
    'style' => 'wp-index-style',
    'editor_style' => 'wp-index-style'
  ));
});
