<?php
/**
 * Plugin Name: Hero Simple Centered
 * Description: Forma generated Gutenberg block.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
  exit;
}

add_action('init', function () {
  wp_register_script(
    'wp-herosimplecentered',
    plugins_url('block.js', __FILE__),
    array('wp-blocks', 'wp-element'),
    filemtime(plugin_dir_path(__FILE__) . 'block.js')
  );

  wp_register_style(
    'wp-herosimplecentered-style',
    plugins_url('style.css', __FILE__),
    array(),
    file_exists(plugin_dir_path(__FILE__) . 'style.css') ? filemtime(plugin_dir_path(__FILE__) . 'style.css') : null
  );

  register_block_type('wp/herosimplecentered-herosimplecentered1global', array(
    'editor_script' => 'wp-herosimplecentered',
    'style' => 'wp-herosimplecentered-style',
    'editor_style' => 'wp-herosimplecentered-style'
  ));

  register_block_type('wp/herosimplecentered-herosimplecentered2datatoenhanceyour', array(
    'editor_script' => 'wp-herosimplecentered',
    'style' => 'wp-herosimplecentered-style',
    'editor_style' => 'wp-herosimplecentered-style'
  ));
});
